mod error;
// The pre-flight checks are pure Rust, so they stay testable without the FFI.
#[cfg_attr(not(feature = "ffi"), allow(dead_code))]
mod model_file;
mod options;

#[cfg(feature = "ffi")]
mod callbacks;
#[cfg(feature = "ffi")]
mod context;
#[cfg(feature = "ffi")]
mod devices;
#[cfg(feature = "ffi")]
#[allow(non_camel_case_types, non_snake_case, non_upper_case_globals, dead_code, improper_ctypes)]
mod ffi;
#[cfg(feature = "ffi")]
mod platform;
#[cfg(feature = "ffi")]
mod stable;

#[cfg(not(feature = "ffi"))]
mod stub;

pub use error::{Error, Result};
pub use options::{ContextOptions, StreamCallbacks, TranscribeOptions};

/// Checks that a file is a whisper.cpp model that can be loaded, without
/// loading it. Callers that only need to identify a file should use this
/// instead of assuming anything that is not another format is whisper.
pub fn validate_model_file(path: impl AsRef<std::path::Path>) -> Result<()> {
    model_file::validate(path.as_ref()).map(|_| ())
}

#[cfg(feature = "ffi")]
pub fn supported_languages() -> Vec<String> {
    (0..=unsafe { ffi::whisper_lang_max_id() })
        .filter_map(|id| {
            let value = unsafe { ffi::whisper_lang_str(id) };
            (!value.is_null()).then(|| unsafe { std::ffi::CStr::from_ptr(value) }.to_string_lossy().into_owned())
        })
        .collect()
}

#[cfg(not(feature = "ffi"))]
pub fn supported_languages() -> Vec<String> {
    Vec::new()
}

#[cfg(feature = "ffi")]
pub use context::set_verbose;
#[cfg(feature = "ffi")]
pub use context::Context;
#[cfg(feature = "ffi")]
pub use devices::{list_gpu_devices, GPUDevice, GPUDeviceType};

#[cfg(not(feature = "ffi"))]
pub use stub::{list_gpu_devices, set_verbose, Context, GPUDevice, GPUDeviceType};

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
        self.segments.iter().map(|segment| segment.text.as_str()).collect()
    }
}
