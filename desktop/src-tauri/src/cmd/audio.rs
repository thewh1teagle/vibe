use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use eyre::{bail, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::utils::random_string;

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

    let default_in = host.default_input_device().map(|e| e.name().unwrap());
    let default_out = host.default_output_device().map(|e| e.name().unwrap());
    log::debug!("Default Input Device:\n{:?}", default_in);
    log::debug!("Default Output Device:\n{:?}", default_out);

    let devices = host.devices()?;
    log::debug!("Devices: ");
    for (device_index, device) in devices.enumerate() {
        let name = device.name()?;
        let is_default_in = default_in.as_ref().map_or(false, |d| d == &name);
        let is_default_out = default_out.as_ref().map_or(false, |d| d == &name);

        let is_input = device.default_input_config().is_ok();

        let audio_device = AudioDevice {
            is_default: is_default_in || is_default_out,
            is_input,
            id: device_index.to_string(),
            name,
        };
        audio_devices.push(audio_device);
    }

    Ok(audio_devices)
}

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(devices: Vec<AudioDevice>) -> Result<PathBuf> {
    let host = cpal::default_host();

    let mut wav_paths: Vec<PathBuf> = Vec::new();
    for device in devices {
        log::debug!("Recording from device: {}", device.name);
        log::debug!("Device ID: {}", device.id);

        let device_id: usize = device.id.parse().context("Failed to parse device ID")?;
        let device = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
        let config = device.default_input_config().context("Failed to get default input config")?;
        let spec = wav_spec_from_config(&config);

        let path = std::env::temp_dir().join(format!("{}.wav", random_string(10)));
        wav_paths.push(path.clone());
        let writer = hound::WavWriter::create(path, spec)?;
        let writer = Arc::new(Mutex::new(Some(writer)));
        let writer_2 = writer.clone();

        let err_fn = move |err| {
            log::error!("an error occurred on stream: {}", err);
        };
        let stream = match config.sample_format() {
            cpal::SampleFormat::I8 => device.build_input_stream(
                &config.into(),
                move |data, _: &_| write_input_data::<i8, i8>(data, &writer_2),
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data, _: &_| write_input_data::<i16, i16>(data, &writer_2),
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I32 => device.build_input_stream(
                &config.into(),
                move |data, _: &_| write_input_data::<i32, i32>(data, &writer_2),
                err_fn,
                None,
            )?,
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data, _: &_| write_input_data::<f32, f32>(data, &writer_2),
                err_fn,
                None,
            )?,
            sample_format => {
                bail!("Unsupported sample format '{}'", sample_format)
            }
        };
        stream.play()?;
        drop(stream);
        writer.lock().unwrap().take().unwrap().finalize()?;
    }

    let merge_path = std::env::temp_dir().join(format!("{}.wav", random_string(10)));
    // Merge files with ffmpeg

    Ok(merge_path)
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

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
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
