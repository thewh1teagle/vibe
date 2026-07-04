mod error;
mod options;

#[cfg(feature = "ffi")]
mod callbacks;
#[cfg(feature = "ffi")]
mod context;
#[cfg(feature = "ffi")]
mod devices;
#[cfg(feature = "ffi")]
#[allow(
    non_camel_case_types,
    non_snake_case,
    non_upper_case_globals,
    dead_code,
    improper_ctypes
)]
mod ffi;
#[cfg(feature = "ffi")]
mod platform;
#[cfg(feature = "ffi")]
mod stable;

#[cfg(not(feature = "ffi"))]
mod stub;

pub use error::{Error, Result};
pub use options::{ContextOptions, StreamCallbacks, TranscribeOptions};

#[cfg(feature = "ffi")]
pub use context::Context;
#[cfg(feature = "ffi")]
pub use context::set_verbose;
#[cfg(feature = "ffi")]
pub use devices::{GPUDevice, GPUDeviceType, list_gpu_devices};

#[cfg(not(feature = "ffi"))]
pub use stub::{Context, GPUDevice, GPUDeviceType, list_gpu_devices, set_verbose};

#[derive(Debug, Clone, PartialEq)]
pub struct Segment {
    pub start: i64,
    pub end: i64,
    pub text: String,
    pub no_speech_prob: f32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct TranscribeResult {
    pub segments: Vec<Segment>,
}

impl TranscribeResult {
    pub fn text(&self) -> String {
        self.segments
            .iter()
            .map(|segment| segment.text.as_str())
            .collect()
    }
}
