#[cfg(target_os = "macos")]
mod imp {
    use block2::StackBlock;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use libloading::{Library, Symbol};
    use std::ffi::c_void;

    const TCC_FRAMEWORK: &str =
        "/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC";
    const TCC_SERVICE: &str = "kTCCServiceAudioCapture";

    fn load_tcc() -> Option<Library> {
        unsafe { Library::new(TCC_FRAMEWORK) }
            .map_err(|e| eprintln!("Failed to load TCC framework: {e}"))
            .ok()
    }

    pub fn check() -> bool {
        let Some(lib) = load_tcc() else { return false };
        unsafe {
            let Ok(preflight): Result<Symbol<unsafe extern "C" fn(CFStringRef, *const c_void) -> u32>, _> =
                lib.get(b"TCCAccessPreflight\0")
            else {
                return false;
            };
            let service = CFString::new(TCC_SERVICE);
            preflight(service.as_concrete_TypeRef(), std::ptr::null()) == 0
        }
    }

    pub fn request() -> bool {
        let Some(lib) = load_tcc() else { return false };
        unsafe {
            let Ok(request_fn): Result<Symbol<unsafe extern "C" fn(CFStringRef, *const c_void, *const c_void)>, _> =
                lib.get(b"TCCAccessRequest\0")
            else {
                return false;
            };

            let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
            // usize is Copy — safe if TCC copies the block internally
            let tx_ptr = Box::into_raw(Box::new(tx)) as usize;

            let completion = StackBlock::new(move |granted: u8| {
                let tx = unsafe {
                    Box::from_raw(tx_ptr as *mut std::sync::mpsc::SyncSender<bool>)
                };
                tx.send(granted != 0).ok();
            });

            let service = CFString::new(TCC_SERVICE);
            request_fn(
                service.as_concrete_TypeRef(),
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
}

/// Silent check, no UI. Returns `true` if already granted.
pub fn check_system_audio_permission() -> bool {
    #[cfg(target_os = "macos")]
    return imp::check();
    #[cfg(not(target_os = "macos"))]
    return true;
}

/// Show system prompt. **Blocking** — does not return until the user responds.
/// Returns `false` immediately (non-blocking) if previously denied — call `open_system_audio_settings` in that case.
pub fn request_system_audio_permission() -> bool {
    #[cfg(target_os = "macos")]
    return imp::request();
    #[cfg(not(target_os = "macos"))]
    return true;
}

/// Open Privacy & Security > System Audio Recording in System Settings.
pub fn open_system_audio_settings() {
    #[cfg(target_os = "macos")]
    imp::open_settings();
}
