use cpal::traits::{DeviceTrait, HostTrait};
use eyre::Result;
use serde::{Deserialize, Serialize};

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
