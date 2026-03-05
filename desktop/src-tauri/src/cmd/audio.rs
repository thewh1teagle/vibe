use crate::audio_utils::get_vibe_temp_folder;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SizedSample, Stream, SupportedStreamConfig};
use eyre::{bail, eyre, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::utils::{get_local_time, random_string, LogError};

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
#[allow(deprecated)]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut audio_devices = Vec::new();

    let default_in = host.default_input_device().map(|e| e.name()).context("name")?;
    let default_out = host.default_output_device().map(|e| e.name()).context("name")?;
    tracing::debug!("Default Input Device:\n{:?}", default_in);
    tracing::debug!("Default Output Device:\n{:?}", default_out);

    let devices = host.devices()?;
    tracing::debug!("Devices: ");
    for (device_index, device) in devices.enumerate() {
        let name = device.name()?;
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

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(
    app_handle: AppHandle,
    devices: Vec<AudioDevice>,
    store_in_documents: bool,
    custom_path: Option<String>,
) -> Result<()> {
    let host = cpal::default_host();

    let mut wav_paths: Vec<(PathBuf, u32)> = Vec::new();
    let mut stream_handles = Vec::new();
    let mut stream_writers = Vec::new();

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

        let stream = build_input_stream(&device, config, writer_2)?;
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
            crate::audio_utils::merge_wav_files(wav_paths[0].0.clone(), wav_paths[1].0.clone(), dst.clone()).map_err(|e| eyre!("{e:?}")).log_error();
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
        let mut normalized = get_vibe_temp_folder().join(format!("{}.wav", get_local_time()));
        crate::audio_utils::normalize(dst.clone(), normalized.clone(), None).map_err(|e| eyre!("{e:?}")).log_error();

        if store_in_documents {
            if let Some(file_name) = normalized.file_name() {
                let save_dir = if let Some(ref cp) = custom_path {
                    Some(PathBuf::from(cp))
                } else {
                    app_handle_clone.path().document_dir().map(|d| d.join(crate::config::DOCUMENTS_SUBFOLDER)).map_err(|e| eyre!("{e:?}")).log_error()
                };
                if let Some(save_dir) = save_dir {
                    let target_path = save_dir.join(file_name);
                    if std::fs::create_dir_all(&save_dir)
                        .context("Failed to create recording directory")
                        .map_err(|e| eyre!("{e:?}"))
                        .is_ok()
                    {
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
        let config = device.default_output_config().context("Failed to get default output config")?;
        return Ok((device, config));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let device_id: usize = audio_device.id.parse().context("Failed to parse device ID")?;
        let device = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
        let config = device.default_output_config().context("Failed to get default output config")?;
        Ok((device, config))
    }
}

fn build_input_stream_typed<T>(device: &Device, config: SupportedStreamConfig, writer: WavWriterHandle) -> Result<Stream>
where
    T: SizedSample + hound::Sample + FromSample<T> + Mul<Output = T> + Copy,
{
    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[T], _: &_| write_input_data::<T, T>(data, &writer),
        |err| tracing::error!("An error occurred on stream: {}", err),
        None,
    )?;
    Ok(stream)
}

fn build_input_stream(device: &Device, config: SupportedStreamConfig, writer: WavWriterHandle) -> Result<Stream> {
    match config.sample_format() {
        cpal::SampleFormat::I8 => build_input_stream_typed::<i8>(device, config, writer),
        cpal::SampleFormat::I16 => build_input_stream_typed::<i16>(device, config, writer),
        cpal::SampleFormat::I32 => build_input_stream_typed::<i32>(device, config, writer),
        cpal::SampleFormat::F32 => build_input_stream_typed::<f32>(device, config, writer),
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
