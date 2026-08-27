use serde::Serialize;

/// Stable frontend contract for native recording permissions.
#[allow(dead_code)] // Some variants are necessarily unreachable on each target OS.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    Granted,
    Denied,
    NotDetermined,
    Restricted,
    NotApplicable,
}

#[cfg(target_os = "macos")]
fn microphone_permission_status() -> PermissionStatus {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

    let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
        return PermissionStatus::NotDetermined;
    };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
    match status {
        AVAuthorizationStatus::Authorized => PermissionStatus::Granted,
        AVAuthorizationStatus::Denied => PermissionStatus::Denied,
        AVAuthorizationStatus::Restricted => PermissionStatus::Restricted,
        _ => PermissionStatus::NotDetermined,
    }
}

#[tauri::command]
pub fn get_microphone_permission_status() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        microphone_permission_status()
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub async fn request_microphone_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use objc2::runtime::Bool;
        use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};

        let current = microphone_permission_status();
        if current != PermissionStatus::NotDetermined {
            return current;
        }

        let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
            return PermissionStatus::NotDetermined;
        };
        let (sender, receiver) = tokio::sync::oneshot::channel();
        {
            let sender = std::sync::Mutex::new(Some(sender));
            let completion = RcBlock::new(move |granted: Bool| {
                if let Ok(mut sender) = sender.lock() {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(granted.as_bool());
                    }
                }
            });
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &completion);
            }
        }

        match receiver.await {
            Ok(true) => PermissionStatus::Granted,
            Ok(false) => PermissionStatus::Denied,
            Err(_) => microphone_permission_status(),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub fn open_microphone_settings() {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()
            .ok();
    }
}

#[tauri::command]
pub fn get_system_audio_permission_status() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        if cpal::platform::check_system_audio_permission() {
            PermissionStatus::Granted
        } else {
            // CPAL's preflight API intentionally exposes all non-granted states
            // as false. Treat the ambiguity as undecided so the UI offers the
            // native request; a failed request then resolves to denied.
            PermissionStatus::NotDetermined
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub async fn request_system_audio_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        if tokio::task::spawn_blocking(cpal::platform::request_system_audio_permission)
            .await
            .unwrap_or(false)
        {
            PermissionStatus::Granted
        } else {
            PermissionStatus::Denied
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub fn open_system_audio_settings() {
    #[cfg(target_os = "macos")]
    {
        cpal::platform::open_system_audio_settings();
    }
}

/// Screen Recording, on macOS, is what lets Vibe read a browser window's title — the only way a
/// Google Meet call can be recognised. Zoom and Teams come from the process list and need nothing.
#[tauri::command]
pub fn get_screen_recording_permission_status() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        if meeting_detect::screen_recording_granted() {
            PermissionStatus::Granted
        } else {
            // The preflight cannot tell "never asked" from "refused", and macOS only shows its
            // prompt once, so the UI offers the request first and falls back to System Settings.
            PermissionStatus::NotDetermined
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub async fn request_screen_recording_permission() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        if tokio::task::spawn_blocking(meeting_detect::request_screen_recording)
            .await
            .unwrap_or(false)
        {
            PermissionStatus::Granted
        } else {
            PermissionStatus::Denied
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotApplicable
    }
}

#[tauri::command]
pub fn open_screen_recording_settings() {
    #[cfg(target_os = "macos")]
    {
        // Same deep link the microphone and system-audio rows use, pointed at Screen Recording.
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_status_serialization_is_the_frontend_contract() {
        let cases = [
            (PermissionStatus::Granted, "\"granted\""),
            (PermissionStatus::Denied, "\"denied\""),
            (PermissionStatus::NotDetermined, "\"not_determined\""),
            (PermissionStatus::Restricted, "\"restricted\""),
            (PermissionStatus::NotApplicable, "\"not_applicable\""),
        ];

        for (status, expected) in cases {
            assert_eq!(serde_json::to_string(&status).unwrap(), expected);
        }
    }
}
