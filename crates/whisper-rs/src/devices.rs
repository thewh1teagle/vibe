use std::ffi::CStr;

use whisper_rs_sys as sys;

#[derive(Debug, Clone, serde::Serialize)]
pub struct GpuDevice {
    pub index: i32,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub device_type: String,
}

pub fn list_gpu_devices() -> Vec<GpuDevice> {
    let count = unsafe { sys::ggml_backend_dev_count() };
    let mut devices = Vec::new();
    for index in 0..count {
        let device = unsafe { sys::ggml_backend_dev_get(index) };
        if device.is_null() {
            continue;
        }
        let Some(device_type) = device_type_name(unsafe { sys::ggml_backend_dev_type(device) }) else {
            continue;
        };
        devices.push(GpuDevice {
            index: index as i32,
            name: read_native_string(unsafe { sys::ggml_backend_dev_name(device) }),
            description: read_native_string(unsafe { sys::ggml_backend_dev_description(device) }),
            device_type: device_type.to_string(),
        });
    }
    devices
}

fn device_type_name(kind: sys::ggml_backend_dev_type) -> Option<&'static str> {
    match kind {
        sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU => Some("gpu"),
        _ => None,
    }
}

fn read_native_string(value: *const std::ffi::c_char) -> String {
    if value.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(value) }.to_string_lossy().into_owned()
    }
}
