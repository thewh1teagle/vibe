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

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(
    app_handle: AppHandle,
    devices: Vec<AudioDevice>,
    store_in_documents: bool,
    custom_path: Option<String>,
    recording_name: Option<String>,
) -> Result<()> {
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

        let dst = if wav_paths.len() == 1 {
            wav_paths[0].0.clone()
        } else if wav_paths[0].1 > 0 && wav_paths[1].1 > 0 {
            let dst = get_vibe_temp_folder().join(format!("{}.wav", random_string(10)));
            tracing::debug!("Merging WAV files");
            crate::ffmpeg::merge_wav_files(wav_paths[0].0.clone(), wav_paths[1].0.clone(), dst.clone()).map_err(|e| eyre!("{e:?}")).log_error();
            dst
        } else if wav_paths[0].1 > wav_paths[1].1 {
            // First WAV file has a larger sample count, choose it
            wav_paths[0].0.clone()
        } else {
            // Second WAV file has a larger sample count or both have non-positive sample counts,
            // choose the second WAV file or fallback to the first one
            wav_paths[1].0.clone()
        };

        tracing::debug!("Emitting record_finish event");
        let recording_stem = recording_name
            .as_deref()
            .map(crate::cmd::files::sanitize_filename_stem)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(get_local_time);
        let temp_dir = get_vibe_temp_folder();
        let mut normalized = crate::cmd::files::available_path(&temp_dir, &recording_stem, "wav");
        crate::ffmpeg::normalize(dst.clone(), normalized.clone(), None).map_err(|e| eyre!("{e:?}")).log_error();

        if store_in_documents {
            if normalized.file_name().is_some() {
                let save_dir = if let Some(ref cp) = custom_path {
                    Some(PathBuf::from(cp))
                } else {
                    app_handle_clone.path().document_dir().map(|d| d.join(crate::config::DOCUMENTS_SUBFOLDER)).map_err(|e| eyre!("{e:?}")).log_error()
                };
                if let Some(save_dir) = save_dir {
                    if std::fs::create_dir_all(&save_dir)
                        .context("Failed to create recording directory")
                        .map_err(|e| eyre!("{e:?}"))
                        .is_ok()
                    {
                        let target_path = crate::cmd::files::available_path(&save_dir, &recording_stem, "wav");
                        let moved = std::fs::rename(&normalized, &target_path)
                            .context("Failed to move file to directory")
                            .map_err(|e| eyre!("{e:?}"))
                            .is_ok();
                        let copied = if moved {
                            false
                        } else {
                            // Cross-filesystem moves can fail; copy as fallback.
                            std::fs::copy(&normalized, &target_path)
                                .context("Failed to copy file to directory")
                                .map_err(|e| eyre!("{e:?}"))
                                .is_ok()
                        };

                        if moved || copied {
                            if copied {
                                std::fs::remove_file(&normalized).map_err(|e| eyre!("{e:?}")).log_error();
                            }
                            normalized = target_path;
                        }
                    }
                }
            } else {
                tracing::error!("Failed to retrieve file name from destination path");
            }
        }

        // Clean files
        for (path, _) in wav_paths {
            if path.exists() {
                std::fs::remove_file(path).map_err(|e| eyre!("{e:?}")).log_error();
            }
        }
        app_handle_clone.emit(
            "record_finish",
            json!({"path": normalized.to_string_lossy(), "name": normalized.file_name().map(|n| n.to_str().unwrap_or_default()).unwrap_or_default()}),
        ).map_err(|e| eyre!("{e:?}")).log_error();
    });

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
