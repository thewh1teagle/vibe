#[tauri::command]
pub async fn request_system_audio_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(cpal::platform::request_system_audio_permission)
            .await
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub async fn open_system_audio_settings() {
    #[cfg(target_os = "macos")]
    {
        cpal::platform::open_system_audio_settings();
    }
}

// AVCaptureDevice audio media type constant value ("soun").
#[cfg(target_os = "macos")]
const AV_MEDIA_TYPE_AUDIO: &str = "soun";

/// Returns true if microphone access is already authorized. Checks silently,
/// without prompting (status 3 == AVAuthorizationStatusAuthorized).
/// Always true on non-macOS platforms.
#[tauri::command]
pub fn microphone_permission_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc2::{class, msg_send};
        use objc2_foundation::NSString;
        let media_type = NSString::from_str(AV_MEDIA_TYPE_AUDIO);
        let status: isize = unsafe { msg_send![class!(AVCaptureDevice), authorizationStatusForMediaType: &*media_type] };
        status == 3
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Requests microphone access. On macOS, shows the native mic prompt if the
/// status is not yet determined; returns the granted result. If previously
/// denied, resolves false immediately (direct the user to System Settings).
/// Always true on non-macOS platforms.
#[tauri::command]
pub async fn request_microphone_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(|| {
            use block2::RcBlock;
            use objc2::runtime::Bool;
            use objc2::{class, msg_send};
            use objc2_foundation::NSString;

            let media_type = NSString::from_str(AV_MEDIA_TYPE_AUDIO);
            let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
            let handler = RcBlock::new(move |granted: Bool| {
                tx.send(granted.as_bool()).ok();
            });
            unsafe {
                let _: () = msg_send![
                    class!(AVCaptureDevice),
                    requestAccessForMediaType: &*media_type,
                    completionHandler: &*handler,
                ];
            }
            rx.recv().unwrap_or(false)
        })
        .await
        .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Open Privacy & Security > Microphone in System Settings.
#[tauri::command]
pub fn open_microphone_settings() {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone")
            .spawn()
            .ok();
    }
}

/// Returns true if the app is trusted for Accessibility (needed by enigo to
/// type at the cursor). On macOS this checks silently, without prompting.
/// Always true on other platforms.
#[tauri::command]
pub fn accessibility_permission_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        use enigo::{Enigo, NewConError, Settings};
        let settings = Settings {
            open_prompt_to_get_permissions: false,
            ..Default::default()
        };
        !matches!(Enigo::new(&settings), Err(NewConError::NoPermission))
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Requests Accessibility permission. On macOS, if the app is not yet trusted
/// this opens the native system prompt that deep-links to System Settings.
/// Returns true if permission is already granted. Note: granting usually
/// requires restarting the app to take effect.
#[tauri::command]
pub fn request_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        use enigo::{Enigo, NewConError, Settings};
        let settings = Settings {
            open_prompt_to_get_permissions: true,
            ..Default::default()
        };
        !matches!(Enigo::new(&settings), Err(NewConError::NoPermission))
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
