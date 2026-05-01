use std::ffi::{c_char, c_void};
use std::sync::Once;

use whisper_rs_sys as sys;

static INSTALL_LOG_SUPPRESSION: Once = Once::new();

pub(crate) fn suppress_native_logs() {
    INSTALL_LOG_SUPPRESSION.call_once(|| unsafe {
        sys::whisper_log_set(Some(discard_log), std::ptr::null_mut());
        sys::ggml_log_set(Some(discard_log), std::ptr::null_mut());
    });
}

unsafe extern "C" fn discard_log(_level: sys::ggml_log_level, _text: *const c_char, _user_data: *mut c_void) {}
