//! The macOS "System Audio Recording" permission, which loopback recording needs.
//!
//! Apple exposes no public API for it, so this asks the private TCC framework about the
//! `kTCCServiceAudioCapture` service directly, loading it at runtime so a macOS without the
//! symbols degrades to "not granted" instead of failing to launch. Without the permission,
//! CoreAudio still opens the loopback stream but delivers silence.

use block2::StackBlock;
use libloading::{Library, Symbol};
use objc2_core_foundation::{CFRetained, CFString};
use std::{ffi::c_void, sync::OnceLock};

const TCC_FRAMEWORK: &str = "/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC";
const TCC_SERVICE: &str = "kTCCServiceAudioCapture";

fn load_tcc() -> Option<&'static Library> {
    static LIBRARY: OnceLock<Option<Library>> = OnceLock::new();
    LIBRARY.get_or_init(|| unsafe { Library::new(TCC_FRAMEWORK) }.ok()).as_ref()
}

fn tcc_service() -> CFRetained<CFString> {
    CFString::from_str(TCC_SERVICE)
}

/// Whether the permission is granted. Every other state (denied, never asked) is `false`.
pub fn is_granted() -> bool {
    let Some(lib) = load_tcc() else { return false };
    unsafe {
        let Ok(preflight): Result<Symbol<unsafe extern "C" fn(*const c_void, *const c_void) -> i32>, _> =
            lib.get(b"TCCAccessPreflight\0")
        else {
            return false;
        };
        let service = tcc_service();
        preflight(&*service as *const _ as *const c_void, std::ptr::null()) == 0
    }
}

/// Shows the system prompt when macOS still allows one, and blocks until it is answered.
pub fn request() -> bool {
    let Some(lib) = load_tcc() else { return false };
    unsafe {
        let Ok(request): Result<Symbol<unsafe extern "C" fn(*const c_void, *const c_void, *const c_void)>, _> =
            lib.get(b"TCCAccessRequest\0")
        else {
            return false;
        };

        let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
        let tx_ptr = Box::into_raw(Box::new(tx)) as usize;
        let completion = StackBlock::new(move |granted: u8| {
            let tx = Box::from_raw(tx_ptr as *mut std::sync::mpsc::SyncSender<bool>);
            tx.send(granted != 0).ok();
        });

        let service = tcc_service();
        request(
            &*service as *const _ as *const c_void,
            std::ptr::null(),
            &completion as *const _ as *const c_void,
        );
        rx.recv().unwrap_or(false)
    }
}

pub fn open_settings() {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AudioCapture")
        .spawn()
        .ok();
}
