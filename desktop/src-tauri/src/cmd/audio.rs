use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, Stream};
use eyre::{bail, eyre, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Listener, Manager};

#[cfg(target_os = "macos")]
use crate::screen_capture_kit;

use crate::utils::{random_string, LogError};

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

    let default_in = host.default_input_device().map(|e| e.name()).context("name")?;
    let default_out = host.default_output_device().map(|e| e.name()).context("name")?;
    tracing::debug!("Default Input Device:\n{:?}", default_in);
    tracing::debug!("Default Output Device:\n{:?}", default_out);

    let devices = host.devices()?;
    tracing::debug!("Devices: ");
    for (device_index, device) in devices.enumerate() {
        let name = device.name()?;
        let is_default_in = default_in.as_ref().map_or(false, |d| d == &name);
        let is_default_out = if cfg!(target_os = "macos") {
            false
        } else {
            default_out.as_ref().map_or(false, |d| d == &name)
        };

        let is_input = device.default_input_config().is_ok();

        let audio_device = AudioDevice {
            is_default: is_default_in || is_default_out,
            is_input,
            id: device_index.to_string(),
            name,
        };
        audio_devices.push(audio_device);
    }

    #[cfg(target_os = "macos")]
    audio_devices.push(AudioDevice {
        is_default: true,
        is_input: false,
        id: "screencapturekit".to_string(),
        name: "Speakers".into(),
    });

    Ok(audio_devices)
}

struct StreamHandle(Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(app_handle: AppHandle, devices: Vec<AudioDevice>, store_in_documents: bool) -> Result<()> {
    let host = cpal::default_host();

    let mut wav_paths: Vec<(PathBuf, u32)> = Vec::new();
    let mut stream_handles = Vec::new();
    let mut stream_writers = Vec::new();

    #[cfg(target_os = "macos")]
    let mut screencapture_stream: Option<_> = None;

    for device in devices {
        tracing::debug!("Recording from device: {}", device.name);
        tracing::debug!("Device ID: {}", device.id);

        let is_input = device.is_input;
        if device.id == "screencapturekit" {
            #[cfg(target_os = "macos")]
            {
                let stream = screen_capture_kit::init()?;
                let stream = Arc::new(stream);
                screencapture_stream = Some(stream.clone());
                screen_capture_kit::start_capture(&stream)?;
            }
        } else {
            let device_id: usize = device.id.parse().context("Failed to parse device ID")?;
            let device = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
            let config = if is_input {
                device.default_input_config().context("Failed to get default input config")?
            } else {
                device.default_output_config().context("Failed to get default input config")?
            };
            let spec = wav_spec_from_config(&config);

            let path = std::env::temp_dir().join(format!("{}.wav", random_string(10)));
            tracing::debug!("WAV file path: {:?}", path);
            wav_paths.push((path.clone(), 0));

            let writer = hound::WavWriter::create(path.clone(), spec)?;
            let writer = Arc::new(Mutex::new(Some(writer)));
            stream_writers.push(writer.clone());
            let writer_2 = writer.clone();

            let err_fn = move |err| {
                tracing::error!("An error occurred on stream: {}", err);
            };

            let volume_factor = if cfg!(windows) { 3 } else { 1 };

            let stream = match config.sample_format() {
                cpal::SampleFormat::I8 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::debug!("Writing input data (I8)");
                        write_input_data::<i8, i8>(data, &writer_2, volume_factor)
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::I16 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::debug!("Writing input data (I16)");
                        write_input_data::<i16, i16>(data, &writer_2, volume_factor.into())
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::I32 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::debug!("Writing input data (I32)");
                        write_input_data::<i32, i32>(data, &writer_2, volume_factor.into())
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::F32 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::debug!("Writing input data (F32)");
                        write_input_data::<f32, f32>(data, &writer_2, volume_factor.into())
                    },
                    err_fn,
                    None,
                )?,
                sample_format => {
                    bail!("Unsupported sample format '{}'", sample_format)
                }
            };
            stream.play()?;
            tracing::debug!("Stream started playing");

            let stream_handle = Arc::new(Mutex::new(Some(StreamHandle(stream))));
            stream_handles.push(stream_handle.clone());
            tracing::debug!("Stream handle created");
        }
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
                    let writer = writer.lock().unwrap().take().unwrap();
                    let written = writer.len();
                    wav_paths[i] = (wav_paths[i].0.clone(), written);
                    writer.finalize().map_err(|e| eyre!("{:?}", e)).log_error();
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(stream) = screencapture_stream {
                screen_capture_kit::stop_capture(&stream).map_err(|e| eyre!("{:?}", e)).log_error();
                let output_path = std::env::temp_dir().join(format!("{}.wav", random_string(5)));
                screen_capture_kit::screencapturekit_to_wav(output_path.clone()).map_err(|e| eyre!("{e:?}")).log_error();
                tracing::debug!("output path is {}", output_path.display());
                wav_paths.push((output_path, 1));
            }
        }

        let mut dst = if wav_paths.len() == 1 {
            wav_paths[0].0.clone()
        } else if wav_paths[0].1 > 0 && wav_paths[1].1 > 0 {
            let dst = std::env::temp_dir().join(format!("{}.wav", random_string(10)));
            tracing::debug!("Merging WAV files");
            vibe_core::audio::merge_wav_files(wav_paths[0].0.clone(), wav_paths[1].0.clone(), dst.clone()).map_err(|e| eyre!("{e:?}")).log_error();
            dst
        } else if wav_paths[0].1 > wav_paths[1].1 {
            // First WAV file has a larger sample count, choose it
            wav_paths[0].0.clone()
        } else {
            // Second WAV file has a larger sample count or both have non-positive sample counts,
            // choose the second WAV file or fallback to the first one
            wav_paths[1].0.clone()
        };
        if store_in_documents {
            if let Some(file_name) = dst.file_name() {
                let documents_path = app_handle_clone.path().document_dir().map_err(|e| eyre!("{e:?}")).log_error();
                if let Some(documents_path) = documents_path {
                    let target_path = documents_path.join(file_name);
                    std::fs::rename(&dst, &target_path).context("Failed to move file to documents directory").map_err(|e| eyre!("{e:?}")).log_error();
                    dst = target_path;
                }
            } else {
                tracing::error!("Failed to retrieve file name from destination path");
            }
        }

        tracing::debug!("Emitting record_finish event");
        app_handle_clone.emit(
            "record_finish",
            json!({"path": dst.to_string_lossy(), "name": dst.file_name().map(|n| n.to_str().unwrap_or_default()).unwrap_or_default()}),
        ).map_err(|e| eyre!("{e:?}")).log_error();
    });

    Ok(())
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
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}

use std::ops::Mul;

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle, volume_factor: U)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T> + Mul<Output = U> + Copy,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in input.iter() {
                let sample: U = U::from_sample(sample) * volume_factor;
                writer.write_sample(sample).ok();
            }
        }
    }
}
