use std::ffi::CStr;

use crate::ffi;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GPUDevice {
    pub index: i32,
    pub name: String,
    pub description: String,
    pub device_type: GPUDeviceType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GPUDeviceType {
    Gpu,
    IntegratedGpu,
}

pub fn list_gpu_devices() -> Vec<GPUDevice> {
    let count = unsafe { ffi::ggml_backend_dev_count() };
    let mut devices = Vec::new();

    for index in 0..count {
        let dev = unsafe { ffi::ggml_backend_dev_get(index) };
        if dev.is_null() {
            continue;
        }

        let device_type = match unsafe { ffi::ggml_backend_dev_type(dev) } {
            ffi::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU => GPUDeviceType::Gpu,
            ffi::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU => {
                GPUDeviceType::IntegratedGpu
            }
            _ => continue,
        };

        devices.push(GPUDevice {
            index: index as i32,
            name: cstr(unsafe { ffi::ggml_backend_dev_name(dev) }),
            description: cstr(unsafe { ffi::ggml_backend_dev_description(dev) }),
            device_type,
        });
    }

    devices
}

fn cstr(ptr: *const libc::c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned()
}
