use crate::ffmpeg::get_vibe_temp_folder;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SizedSample, Stream, SupportedStreamConfig};
use eyre::{bail, eyre, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Listener};

use crate::error::LogError;
use crate::ffmpeg::{get_local_time, random_string};

type WavWriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub is_default: bool,
    pub is_input: bool,
    pub id: String,
    pub name: String,
}

/// What a listed cpal device needs to get a stable id: its backend id when cpal has one, else its
/// name and direction.
#[derive(Debug, Clone)]
struct DeviceInfo {
    cpal_id: Option<String>,
    name: String,
    is_input: bool,
}

/// One stable id per listed device, in list order.
///
/// The id is cpal's own `DeviceId` (`"<host>:<device uid>"`, e.g. the CoreAudio UID or the WASAPI
/// endpoint id), which survives devices connecting and disconnecting. A backend that cannot give
/// one falls back to `name:<in|out>:<name>`. A repeated id (two devices with the same name, or a
/// backend that reports a duplicate) gets `#2`, `#3`... in list order, so every entry stays distinct.
/// Never the list position: that moves when AirPods or a virtual driver come and go (#1676).
fn device_keys(infos: &[DeviceInfo]) -> Vec<String> {
    let mut seen: HashMap<String, usize> = HashMap::new();
    infos
        .iter()
        .map(|info| {
            let base = match &info.cpal_id {
                Some(id) => id.clone(),
                None => format!("name:{}:{}", if info.is_input { "in" } else { "out" }, info.name),
            };
            let count = seen.entry(base.clone()).or_insert(0);
            *count += 1;
            if *count == 1 {
                base
            } else {
                format!("{base}#{count}")
            }
        })
        .collect()
}

/// Ids saved before #1676 were list positions ("0", "3"). They cannot be trusted: the list has
/// likely moved since, so they mean "no saved device".
fn is_legacy_index_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())
}

#[derive(Debug, PartialEq, Eq)]
enum Resolved {
    /// The requested device is in the list at this position.
    Index(usize),
    /// Use the system default device. `missing` is true when a real saved device is not connected,
    /// so the caller must tell the user instead of switching silently.
    Default { missing: bool },
}

fn resolve_device(infos: &[DeviceInfo], requested_id: &str, is_input: bool) -> Resolved {
    if requested_id.is_empty() || is_legacy_index_id(requested_id) {
        return Resolved::Default { missing: false };
    }
    device_keys(infos)
        .iter()
        .zip(infos)
        .position(|(key, info)| key == requested_id && info.is_input == is_input)
        .map_or(Resolved::Default { missing: true }, Resolved::Index)
}

fn device_name(device: &Device) -> String {
    device
        .description()
        .map(|d| d.to_string())
        .unwrap_or_else(|_| "Unknown device".to_string())
}

fn list_devices(host: &cpal::Host) -> Result<Vec<(Device, DeviceInfo)>> {
    Ok(host
        .devices()?
        .map(|device| {
            let info = DeviceInfo {
                cpal_id: device.id().ok().map(|id| id.to_string()),
                name: device_name(&device),
                is_input: device.supports_input(),
            };
            (device, info)
        })
        .collect())
}

/// A requested device that was not connected, and the default device recorded instead.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFallback {
    pub requested: String,
    pub used: String,
    pub is_input: bool,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartRecordOutcome {
    /// Saved devices that were missing; the UI warns about each one.
    pub device_fallbacks: Vec<DeviceFallback>,
}

/// Opens the requested device by its stable id, or the system default when it is absent.
fn pick_device(host: &cpal::Host, requested: &AudioDevice) -> Result<(Device, Option<DeviceFallback>)> {
    let listed = list_devices(host)?;
    let infos: Vec<DeviceInfo> = listed.iter().map(|(_, info)| info.clone()).collect();
    match resolve_device(&infos, &requested.id, requested.is_input) {
        Resolved::Index(index) => Ok((listed[index].0.clone(), None)),
        Resolved::Default { missing } => {
            let device = if requested.is_input {
                host.default_input_device().context("No default input device is available")?
            } else {
                host.default_output_device()
                    .context("No default output device is available")?
            };
            let fallback = missing.then(|| DeviceFallback {
                requested: requested.name.clone(),
                used: device_name(&device),
                is_input: requested.is_input,
            });
            if let Some(fallback) = &fallback {
                tracing::warn!(
                    "Device {:?} ({}) is not connected; recording from the default {:?} instead",
                    fallback.requested,
                    requested.id,
                    fallback.used
                );
            }
            Ok((device, fallback))
        }
    }
}

#[tauri::command]
pub fn get_audio_devices() -> CommandResult<Vec<AudioDevice>> {
    let host = cpal::default_host();

    let default_in = host.default_input_device();
    let default_out = host.default_output_device();
    let default_ids: Vec<String> = [&default_in, &default_out]
        .into_iter()
        .flatten()
        .filter_map(|d| d.id().ok().map(|id| id.to_string()))
        .collect();
    let default_names: Vec<String> = [&default_in, &default_out].into_iter().flatten().map(device_name).collect();
    tracing::debug!("Default devices: {:?} {:?}", default_names, default_ids);

    let listed = list_devices(&host)?;
    let infos: Vec<DeviceInfo> = listed.into_iter().map(|(_, info)| info).collect();
    let keys = device_keys(&infos);
    let audio_devices = infos
        .into_iter()
        .zip(keys)
        .map(|(info, id)| {
            let is_default = match &info.cpal_id {
                Some(cpal_id) => default_ids.contains(cpal_id),
                None => default_names.contains(&info.name),
            };
            AudioDevice {
                is_default,
                is_input: info.is_input,
                id,
                name: info.name,
            }
        })
        .collect();
    tracing::debug!("Devices: {:?}", audio_devices);

    Ok(audio_devices)
}

struct StreamHandle(Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

/// At most ~10 `record_level` events per second reach the webview.
const LEVEL_EMIT_INTERVAL_MS: u64 = 100;
/// Below this peak over the whole recording (about -80 dBFS), nothing was captured: a muted or
/// wrong device, such as a virtual driver that only ever delivers zeros (#1676).
const SILENCE_PEAK_THRESHOLD: f32 = 1.0e-4;

/// Shared by every capture stream of a recording session, so the emitted value is the max
/// level across input + output (loopback) devices.
///
/// Everything here is atomic and allocation-free: the audio callback only does a few relaxed
/// loads/stores, and once per 100ms one callback also performs the (non-blocking) `emit_to`.
struct LevelMeter {
    app_handle: AppHandle,
    started_at: Instant,
    /// Max level seen since the last emit, stored as `f32::to_bits` (monotonic for +0.0..=1.0).
    peak_bits: AtomicU32,
    /// Max level over the whole session, for the silent-recording warning.
    session_peak_bits: AtomicU32,
    last_emit_ms: AtomicU64,
}

impl LevelMeter {
    fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            started_at: Instant::now(),
            peak_bits: AtomicU32::new(0),
            session_peak_bits: AtomicU32::new(0),
            last_emit_ms: AtomicU64::new(0),
        }
    }

    /// Accumulate one buffer's peak and emit if the throttle window elapsed.
    fn push(&self, peak: f32) {
        self.peak_bits.fetch_max(peak.to_bits(), Ordering::Relaxed);
        self.session_peak_bits.fetch_max(peak.to_bits(), Ordering::Relaxed);

        let now_ms = self.started_at.elapsed().as_millis() as u64;
        let last_ms = self.last_emit_ms.load(Ordering::Relaxed);
        if now_ms.saturating_sub(last_ms) < LEVEL_EMIT_INTERVAL_MS {
            return;
        }
        // Only the stream that wins the swap emits, so two devices can't double-emit a window.
        if self
            .last_emit_ms
            .compare_exchange(last_ms, now_ms, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            return;
        }
        let level = f32::from_bits(self.peak_bits.swap(0, Ordering::Relaxed)).clamp(0.0, 1.0);
        self.app_handle.emit_to("main", "record_level", level).ok();
    }

    fn session_peak(&self) -> f32 {
        f32::from_bits(self.session_peak_bits.load(Ordering::Relaxed))
    }
}

/// The `record_finish` warning for a recording in which no device captured any sound.
fn silence_warning(session_peak: f32, device_names: &[String]) -> Option<String> {
    (session_peak < SILENCE_PEAK_THRESHOLD).then(|| {
        format!(
            "The recording is silent: no sound was captured from {}. Check that the right device is selected and not muted.",
            device_names.join(" + ")
        )
    })
}

/// Peak magnitude of a buffer, normalized to 0..1. Every sample counts: a stride would only ever
/// read some channels of an interleaved buffer and could call a live channel silent.
fn buffer_peak<T>(input: &[T]) -> f32
where
    T: Sample,
    f32: FromSample<T>,
{
    let mut peak = 0.0f32;
    for &sample in input.iter() {
        let value = f32::from_sample(sample).abs();
        if value > peak {
            peak = value;
        }
    }
    peak.min(1.0)
}

fn best_raw_capture(wav_paths: &[(PathBuf, u32)]) -> Option<PathBuf> {
    wav_paths
        .iter()
        .max_by_key(|(_, samples)| *samples)
        .map(|(path, _)| path.clone())
}

fn remove_recording_intermediates(paths: impl IntoIterator<Item = PathBuf>, keep: &PathBuf) {
    for path in paths {
        if path != *keep && path.exists() {
            std::fs::remove_file(path).map_err(|e| eyre!("{e:?}")).log_error();
        }
    }
}

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(
    app_handle: AppHandle,
    devices: Vec<AudioDevice>,
    recording_name: Option<String>,
) -> CommandResult<StartRecordOutcome> {
    if devices.is_empty() {
        return Err(eyre!("At least one audio device is required").into());
    }
    let host = cpal::default_host();

    let mut wav_paths: Vec<(PathBuf, u32)> = Vec::new();
    let mut stream_handles = Vec::new();
    let mut stream_writers = Vec::new();
    // One meter for the whole session: input and output streams both feed it, so the UI sees
    // the max of the two under a single throttled `record_level` event.
    let meter = Arc::new(LevelMeter::new(app_handle.clone()));
    let mut outcome = StartRecordOutcome::default();
    let mut device_names = Vec::new();

    for device in devices {
        tracing::debug!("Recording from device: {}", device.name);
        tracing::debug!("Device ID: {}", device.id);

        let (device, config, fallback) = if device.is_input {
            let (dev, fallback) = pick_device(&host, &device)?;
            let config = dev.default_input_config().context("Failed to get default input config")?;
            (dev, config, fallback)
        } else {
            get_output_device_and_config(&host, &device)?
        };
        device_names.push(device_name(&device));
        outcome.device_fallbacks.extend(fallback);
        let spec = wav_spec_from_config(&config);

        let path = get_vibe_temp_folder().join(format!("{}.wav", random_string(10)));
        tracing::debug!("WAV file path: {:?}", path);
        wav_paths.push((path.clone(), 0));

        let writer = hound::WavWriter::create(path.clone(), spec)?;
        let writer = Arc::new(Mutex::new(Some(writer)));
        stream_writers.push(writer.clone());
        let writer_2 = writer.clone();

        let stream = build_input_stream(&device, config, writer_2, meter.clone())?;
        stream.play()?;
        tracing::debug!("Stream started playing");

        let stream_handle = Arc::new(Mutex::new(Some(StreamHandle(stream))));
        stream_handles.push(stream_handle.clone());
        tracing::debug!("Stream handle created");
    }

    let app_handle_clone = app_handle.clone();
    let session_meter = meter.clone();
    let stop = std::sync::Mutex::new(Some(move || {
        for (i, stream_handle) in stream_handles.iter().enumerate() {
            let stream_handle = stream_handle.lock().map_err(|e| eyre!("{:?}", e)).log_error();
            if let Some(mut stream_handle) = stream_handle {
                let stream = stream_handle.take();
                let writer = stream_writers[i].clone();
                if let Some(stream) = stream {
                    tracing::debug!("Pausing stream");
                    stream.0.pause().map_err(|e| eyre!("{:?}", e)).log_error();
                    tracing::debug!("Finalizing writer");
                    let writer = writer.lock().expect("lock").take().expect("writer");
                    let written = writer.len();
                    wav_paths[i] = (wav_paths[i].0.clone(), written);
                    writer.finalize().map_err(|e| eyre!("{:?}", e)).log_error();
                }
            }
        }

        let Some(best_raw) = best_raw_capture(&wav_paths) else {
            tracing::error!("Recording stopped without any capture files");
            app_handle_clone
                .emit(
                    "record_error",
                    json!({"message": "Recording stopped without any captured audio"}),
                )
                .map_err(|e| eyre!("{e:?}"))
                .log_error();
            crate::meeting_prompt::recording_stopped(&app_handle_clone);
            return;
        };

        let (dst, mut warning) = if wav_paths.len() > 1 && wav_paths[0].1 > 0 && wav_paths[1].1 > 0 {
            let dst = get_vibe_temp_folder().join(format!("{}.wav", random_string(10)));
            tracing::debug!("Merging WAV files");
            match crate::ffmpeg::merge_wav_files(wav_paths[0].0.clone(), wav_paths[1].0.clone(), dst.clone()) {
                Ok(()) if dst.is_file() => (dst, None),
                Ok(()) => {
                    std::fs::remove_file(&dst).ok();
                    let message = "Audio merge produced no output; preserving the best raw capture".to_string();
                    tracing::error!("{message}");
                    (best_raw, Some(message))
                }
                Err(error) => {
                    std::fs::remove_file(&dst).ok();
                    let message = format!("Audio merge failed; preserving the best raw capture: {error:#}");
                    tracing::error!("{message}");
                    (best_raw, Some(message))
                }
            }
        } else {
            (best_raw, None)
        };
        // Peak was tracked in the capture callbacks, so this costs nothing at stop time.
        if let Some(message) = silence_warning(session_meter.session_peak(), &device_names) {
            tracing::warn!("{message}");
            warning = Some(match warning {
                Some(previous) => format!("{message}; {previous}"),
                None => message,
            });
        }

        tracing::debug!("Emitting record_finish event");
        let recording_stem = recording_name
            .as_deref()
            .map(crate::cmd::files::sanitize_filename_stem)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(get_local_time);
        let temp_dir = get_vibe_temp_folder();
        let normalized = crate::cmd::files::available_path(&temp_dir, &recording_stem, "wav");
        let output = match crate::ffmpeg::normalize(dst.clone(), normalized.clone(), None) {
            Ok(()) if normalized.is_file() => normalized,
            result => {
                std::fs::remove_file(&normalized).ok();
                let detail = match result {
                    Ok(()) => "normalization produced no output".to_string(),
                    Err(error) => format!("{error:#}"),
                };
                let message = format!("Audio normalization failed; preserving the unnormalized capture: {detail}");
                tracing::error!("{message}");
                warning = Some(match warning {
                    Some(previous) => format!("{previous}; {message}"),
                    None => message,
                });

                let recovery = crate::cmd::files::available_path(&temp_dir, &recording_stem, "wav");
                if dst != recovery && std::fs::rename(&dst, &recovery).is_ok() {
                    recovery
                } else {
                    dst.clone()
                }
            }
        };

        let intermediates = wav_paths.into_iter().map(|(path, _)| path).chain(std::iter::once(dst));
        remove_recording_intermediates(intermediates, &output);
        // A recording this process made just finished: the one thing that lets `type_text` run.
        crate::cmd::app::recording_finished();
        app_handle_clone
            .emit(
                "record_finish",
                json!({
                    "path": output.to_string_lossy(),
                    "name": output.file_name().map(|n| n.to_str().unwrap_or_default()).unwrap_or_default(),
                    "warning": warning,
                }),
            )
            .map_err(|e| eyre!("{e:?}"))
            .log_error();
        crate::meeting_prompt::recording_stopped(&app_handle_clone);
    }));
    // Not `once`: its handler panics if `stop_record` arrives again while the first stop is still
    // merging (a double click, or the button and the shortcut together), and a release build
    // aborts on that panic. A repeat stop is simply ignored here.
    let listener_handle = app_handle.clone();
    app_handle.listen("stop_record", move |event| {
        let Some(stop) = stop.lock().ok().and_then(|mut stop| stop.take()) else {
            tracing::debug!("Ignoring a repeated stop_record (event {})", event.id());
            return;
        };
        tracing::debug!("stop_record received (event {})", event.id());
        listener_handle.unlisten(event.id());
        stop();
    });

    crate::meeting_prompt::recording_started(&app_handle);
    Ok(outcome)
}

#[allow(unused_variables)]
fn get_output_device_and_config(
    host: &cpal::Host,
    audio_device: &AudioDevice,
) -> Result<(Device, SupportedStreamConfig, Option<DeviceFallback>)> {
    // On macOS, use the default output device directly — cpal's loopback support
    // requires this path to build an input stream from an output device.
    #[cfg(target_os = "macos")]
    {
        // Without the permission CoreAudio still opens the stream and records silence, so fail
        // clearly instead of handing back an empty recording.
        if !crate::system_audio::is_granted() {
            bail!("System audio recording permission is required to record system audio; grant it in System Settings → Privacy & Security → Screen & System Audio Recording");
        }
        let device = host.default_output_device().context("Failed to get default output device")?;
        let config = device
            .default_output_config()
            .context("Failed to get default output config")?;
        Ok((device, config, None))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let (device, fallback) = pick_device(host, audio_device)?;
        let config = device
            .default_output_config()
            .context("Failed to get default output config")?;
        Ok((device, config, fallback))
    }
}

fn build_input_stream_typed<T>(
    device: &Device,
    config: SupportedStreamConfig,
    writer: WavWriterHandle,
    meter: Arc<LevelMeter>,
) -> Result<Stream>
where
    T: SizedSample + hound::Sample + FromSample<T> + Mul<Output = T> + Copy,
    f32: FromSample<T>,
{
    let stream = device.build_input_stream(
        config.into(),
        move |data: &[T], _: &_| {
            meter.push(buffer_peak(data));
            write_input_data::<T, T>(data, &writer)
        },
        |err| tracing::error!("An error occurred on stream: {}", err),
        None,
    )?;
    Ok(stream)
}

fn build_input_stream(
    device: &Device,
    config: SupportedStreamConfig,
    writer: WavWriterHandle,
    meter: Arc<LevelMeter>,
) -> Result<Stream> {
    match config.sample_format() {
        cpal::SampleFormat::I8 => build_input_stream_typed::<i8>(device, config, writer, meter),
        cpal::SampleFormat::I16 => build_input_stream_typed::<i16>(device, config, writer, meter),
        cpal::SampleFormat::I32 => build_input_stream_typed::<i32>(device, config, writer, meter),
        cpal::SampleFormat::F32 => build_input_stream_typed::<f32>(device, config, writer, meter),
        sample_format => bail!("Unsupported sample format '{}'", sample_format),
    }
}

fn sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
    if format.is_float() {
        hound::SampleFormat::Float
    } else {
        hound::SampleFormat::Int
    }
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate(),
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}

use crate::error::CommandResult;
use std::ops::Mul;

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T> + Mul<Output = U> + Copy,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in input.iter() {
                let sample: U = U::from_sample(sample);
                writer.write_sample(sample).ok();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn info(cpal_id: Option<&str>, name: &str, is_input: bool) -> DeviceInfo {
        DeviceInfo {
            cpal_id: cpal_id.map(str::to_string),
            name: name.to_string(),
            is_input,
        }
    }

    #[test]
    fn a_device_that_moved_in_the_list_is_still_found() {
        let before = vec![
            info(Some("coreaudio:BuiltInMic"), "MacBook Pro Microphone", true),
            info(Some("coreaudio:USB-1"), "Yeti", true),
        ];
        let saved = device_keys(&before)[1].clone();
        // AirPods and a virtual driver connected ahead of it: the old index 1 is now AirPods.
        let after = vec![
            info(Some("coreaudio:AirPods"), "AirPods", true),
            info(Some("coreaudio:Teams"), "Microsoft Teams Audio", true),
            info(Some("coreaudio:BuiltInMic"), "MacBook Pro Microphone", true),
            info(Some("coreaudio:USB-1"), "Yeti", true),
        ];
        assert_eq!(resolve_device(&after, &saved, true), Resolved::Index(3));
    }

    #[test]
    fn a_missing_device_falls_back_to_the_default_and_says_so() {
        let devices = vec![info(Some("coreaudio:BuiltInMic"), "MacBook Pro Microphone", true)];
        assert_eq!(
            resolve_device(&devices, "coreaudio:USB-1", true),
            Resolved::Default { missing: true }
        );
        // Right id, wrong direction: not a match either.
        assert_eq!(
            resolve_device(&devices, "coreaudio:BuiltInMic", false),
            Resolved::Default { missing: true }
        );
    }

    #[test]
    fn devices_sharing_a_name_get_distinct_ids() {
        let with_ids = vec![
            info(Some("wasapi:{a}"), "USB Audio", true),
            info(Some("wasapi:{b}"), "USB Audio", true),
        ];
        let keys = device_keys(&with_ids);
        assert_ne!(keys[0], keys[1]);
        assert_eq!(resolve_device(&with_ids, "wasapi:{b}", true), Resolved::Index(1));

        let without_ids = vec![
            info(None, "USB Audio", true),
            info(None, "USB Audio", false),
            info(None, "USB Audio", true),
        ];
        let keys = device_keys(&without_ids);
        assert_eq!(keys, ["name:in:USB Audio", "name:out:USB Audio", "name:in:USB Audio#2"]);
        assert_eq!(resolve_device(&without_ids, "name:in:USB Audio#2", true), Resolved::Index(2));
        assert_eq!(resolve_device(&without_ids, "name:out:USB Audio", false), Resolved::Index(1));
    }

    #[test]
    fn an_old_index_id_means_the_default_device_without_a_warning() {
        let devices = vec![
            info(Some("coreaudio:Teams"), "Microsoft Teams Audio", true),
            info(Some("coreaudio:BuiltInMic"), "MacBook Pro Microphone", true),
        ];
        assert_eq!(resolve_device(&devices, "0", true), Resolved::Default { missing: false });
        assert_eq!(resolve_device(&devices, "12", true), Resolved::Default { missing: false });
        assert_eq!(resolve_device(&devices, "", true), Resolved::Default { missing: false });
    }

    #[test]
    fn a_silent_session_gets_a_warning() {
        let names = vec!["Microsoft Teams Audio".to_string()];
        assert!(silence_warning(0.0, &names).unwrap().contains("Microsoft Teams Audio"));
        assert!(silence_warning(0.01, &names).is_none());
    }

    #[test]
    fn buffer_peak_reads_every_channel() {
        // Interleaved stereo with sound only on the right channel.
        let buffer = [0.0f32, 0.5, 0.0, -0.25, 0.0, 0.0, 0.0, 0.0];
        assert_eq!(buffer_peak(&buffer), 0.5);
    }

    #[test]
    fn recovery_prefers_the_capture_with_the_most_samples() {
        let captures = vec![(PathBuf::from("short.wav"), 12), (PathBuf::from("long.wav"), 42)];
        assert_eq!(best_raw_capture(&captures), Some(PathBuf::from("long.wav")));
        assert_eq!(best_raw_capture(&[]), None);
    }
}
