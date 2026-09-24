use crate::ffmpeg::get_vibe_temp_folder;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SizedSample, Stream, SupportedStreamConfig};
use eyre::{bail, eyre, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::error::LogError;
use crate::ffmpeg::{get_local_time, random_string};

type WavWriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub is_default: bool,
    pub is_input: bool,
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut audio_devices = Vec::new();

    let default_in = host
        .default_input_device()
        .map(|e| e.description().map(|d| d.to_string()))
        .context("name")?;
    let default_out = host
        .default_output_device()
        .map(|e| e.description().map(|d| d.to_string()))
        .context("name")?;
    tracing::debug!("Default Input Device:\n{:?}", default_in);
    tracing::debug!("Default Output Device:\n{:?}", default_out);

    let devices = host.devices()?;
    tracing::debug!("Devices: ");
    for (device_index, device) in devices.enumerate() {
        let name = device.description()?.to_string();
        let is_default_in = default_in.as_ref().is_ok_and(|d| d == &name);
        let is_default_out = default_out.as_ref().is_ok_and(|d| d == &name);

        let audio_device = AudioDevice {
            is_default: is_default_in || is_default_out,
            is_input: device.supports_input(),
            id: device_index.to_string(),
            name,
        };
        audio_devices.push(audio_device);
    }

    Ok(audio_devices)
}

struct StreamHandle(Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

/// At most ~10 `record_level` events per second reach the webview.
const LEVEL_EMIT_INTERVAL_MS: u64 = 100;
/// Peak is taken from every Nth sample — plenty for a meter, and keeps the callback cheap.
const LEVEL_SAMPLE_STRIDE: usize = 4;

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
    last_emit_ms: AtomicU64,
}

impl LevelMeter {
    fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            started_at: Instant::now(),
            peak_bits: AtomicU32::new(0),
            last_emit_ms: AtomicU64::new(0),
        }
    }

    /// Accumulate one buffer's peak and emit if the throttle window elapsed.
    fn push(&self, peak: f32) {
        self.peak_bits.fetch_max(peak.to_bits(), Ordering::Relaxed);

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
}

/// Streams held while the input dropdown is open so every mic can show a live level.
/// Dropping the vector closes the streams. Guarded by a mutex for idempotent
/// start/stop from the UI and a defensive stop when a real recording starts.
#[derive(Default)]
pub struct InputPreviewState {
    streams: Mutex<Option<Vec<StreamHandle>>>,
}

impl InputPreviewState {
    fn stop(&self) {
        // Take ownership so the streams are dropped (closed) outside of any other work.
        let streams = self.streams.lock().map(|mut guard| guard.take()).unwrap_or(None);
        drop(streams);
    }
}

/// Per-device meter for the input-level preview. Unlike [`LevelMeter`] (one shared value
/// for a recording session), each preview stream owns one of these so the UI can render
/// a live bar next to every input device in the dropdown.
///
/// Emits `input_level` as `{ deviceId, level }`, throttled to ~10/s per device.
struct DeviceLevelMeter {
    app_handle: AppHandle,
    device_id: String,
    started_at: Instant,
    peak_bits: AtomicU32,
    last_emit_ms: AtomicU64,
}

impl DeviceLevelMeter {
    fn new(app_handle: AppHandle, device_id: String) -> Self {
        Self {
            app_handle,
            device_id,
            started_at: Instant::now(),
            peak_bits: AtomicU32::new(0),
            last_emit_ms: AtomicU64::new(0),
        }
    }

    fn push(&self, peak: f32) {
        self.peak_bits.fetch_max(peak.to_bits(), Ordering::Relaxed);

        let now_ms = self.started_at.elapsed().as_millis() as u64;
        let last_ms = self.last_emit_ms.load(Ordering::Relaxed);
        if now_ms.saturating_sub(last_ms) < LEVEL_EMIT_INTERVAL_MS {
            return;
        }
        if self
            .last_emit_ms
            .compare_exchange(last_ms, now_ms, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            return;
        }
        let level = f32::from_bits(self.peak_bits.swap(0, Ordering::Relaxed)).clamp(0.0, 1.0);
        self.app_handle
            .emit_to("main", "input_level", json!({ "deviceId": self.device_id, "level": level }))
            .ok();
    }
}

fn build_preview_stream_typed<T>(device: &Device, config: SupportedStreamConfig, meter: Arc<DeviceLevelMeter>) -> Result<Stream>
where
    T: SizedSample + FromSample<T> + Copy,
    f32: FromSample<T>,
{
    let stream = device.build_input_stream(
        config.into(),
        move |data: &[T], _: &_| {
            meter.push(buffer_peak(data));
        },
        |err| tracing::error!("An error occurred on input preview stream: {}", err),
        None,
    )?;
    Ok(stream)
}

fn build_preview_stream(device: &Device, config: SupportedStreamConfig, meter: Arc<DeviceLevelMeter>) -> Result<Stream> {
    match config.sample_format() {
        cpal::SampleFormat::I8 => build_preview_stream_typed::<i8>(device, config, meter),
        cpal::SampleFormat::I16 => build_preview_stream_typed::<i16>(device, config, meter),
        cpal::SampleFormat::I32 => build_preview_stream_typed::<i32>(device, config, meter),
        cpal::SampleFormat::F32 => build_preview_stream_typed::<f32>(device, config, meter),
        sample_format => bail!("Unsupported sample format '{}'", sample_format),
    }
}

#[tauri::command]
/// Open a meter-only capture stream per input device and emit `input_level`
/// events (`{ deviceId, level }`, ~10/s). Idempotent: a second call while the
/// preview is active is a no-op. Devices that cannot be opened are skipped with
/// a warning so one busy mic never blocks the rest.
///
/// The mutex is held for the whole open so two concurrent starts cannot both
/// pass the "already running" check and open duplicate device streams.
pub fn start_input_level_preview(app_handle: AppHandle, preview: tauri::State<'_, InputPreviewState>) -> Result<()> {
    let mut guard = preview.streams.lock().map_err(|e| eyre!("{:?}", e))?;
    if guard.is_some() {
        return Ok(());
    }

    let host = cpal::default_host();
    let mut streams = Vec::new();

    let devices = host.devices()?;
    for (device_index, device) in devices.enumerate() {
        if !device.supports_input() {
            continue;
        }
        let device_id = device_index.to_string();
        let config = match device.default_input_config() {
            Ok(config) => config,
            Err(error) => {
                tracing::warn!("Skipping input device {device_id} for level preview: {error:#}");
                continue;
            }
        };
        let meter = Arc::new(DeviceLevelMeter::new(app_handle.clone(), device_id.clone()));
        match build_preview_stream(&device, config, meter).and_then(|stream| stream.play().map(|_| stream).map_err(Into::into)) {
            Ok(stream) => streams.push(StreamHandle(stream)),
            Err(error) => tracing::warn!("Skipping input device {device_id} for level preview: {error:#}"),
        }
    }

    *guard = Some(streams);
    Ok(())
}

#[tauri::command]
/// Close the meter-only streams opened by [`start_input_level_preview`].
pub fn stop_input_level_preview(preview: tauri::State<'_, InputPreviewState>) -> Result<()> {
    preview.stop();
    Ok(())
}

/// Peak magnitude of a buffer, normalized to 0..1.
fn buffer_peak<T>(input: &[T]) -> f32
where
    T: Sample,
    f32: FromSample<T>,
{
    let mut peak = 0.0f32;
    for &sample in input.iter().step_by(LEVEL_SAMPLE_STRIDE) {
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
pub async fn start_record(app_handle: AppHandle, devices: Vec<AudioDevice>, recording_name: Option<String>) -> Result<()> {
    if devices.is_empty() {
        bail!("At least one audio device is required");
    }
    // The input-level preview holds the same devices open while the dropdown is shown;
    // release it first so a real recording never fights the meter-only streams.
    if let Some(preview) = app_handle.try_state::<InputPreviewState>() {
        preview.stop();
    }
    let host = cpal::default_host();

    let mut wav_paths: Vec<(PathBuf, u32)> = Vec::new();
    let mut stream_handles = Vec::new();
    let mut stream_writers = Vec::new();
    // One meter for the whole session: input and output streams both feed it, so the UI sees
    // the max of the two under a single throttled `record_level` event.
    let meter = Arc::new(LevelMeter::new(app_handle.clone()));

    for device in devices {
        tracing::debug!("Recording from device: {}", device.name);
        tracing::debug!("Device ID: {}", device.id);

        let is_input = device.is_input;
        let (device, config) = if is_input {
            let device_id: usize = device.id.parse().context("Failed to parse device ID")?;
            let dev = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
            let config = dev.default_input_config().context("Failed to get default input config")?;
            (dev, config)
        } else {
            get_output_device_and_config(&host, &device)?
        };
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
    app_handle.once("stop_record", move |_event| {
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
    });

    crate::meeting_prompt::recording_started(&app_handle);
    Ok(())
}

#[allow(unused_variables)]
fn get_output_device_and_config(host: &cpal::Host, audio_device: &AudioDevice) -> Result<(Device, SupportedStreamConfig)> {
    // On macOS, use the default output device directly — cpal's loopback support
    // requires this path to build an input stream from an output device.
    #[cfg(target_os = "macos")]
    {
        let device = host.default_output_device().context("Failed to get default output device")?;
        let config = device
            .default_output_config()
            .context("Failed to get default output config")?;
        Ok((device, config))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let device_id: usize = audio_device.id.parse().context("Failed to parse device ID")?;
        let device = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
        let config = device
            .default_output_config()
            .context("Failed to get default output config")?;
        Ok((device, config))
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
    use super::best_raw_capture;
    use std::path::PathBuf;

    #[test]
    fn recovery_prefers_the_capture_with_the_most_samples() {
        let captures = vec![(PathBuf::from("short.wav"), 12), (PathBuf::from("long.wav"), 42)];
        assert_eq!(best_raw_capture(&captures), Some(PathBuf::from("long.wav")));
        assert_eq!(best_raw_capture(&[]), None);
    }
}
