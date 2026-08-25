use crate::MicUsage;

/// Return the strongest microphone-ownership signal available on this OS.
pub(crate) fn current_usage() -> MicUsage {
    platform::current_usage()
}

#[cfg(any(target_os = "linux", test))]
fn process_from_properties(properties: &serde_json::Map<String, serde_json::Value>) -> crate::ProcessInfo {
    let string = |key: &str| properties.get(key).and_then(serde_json::Value::as_str);
    let executable = string("application.process.binary").map(str::to_string);
    let name = string("application.name")
        .or_else(|| string("media.name"))
        .or(executable.as_deref())
        .unwrap_or("microphone client")
        .to_string();
    let pid = properties.get("application.process.id").and_then(|value| {
        value
            .as_u64()
            .and_then(|pid| u32::try_from(pid).ok())
            .or_else(|| value.as_str().and_then(|pid| pid.parse().ok()))
    });
    crate::ProcessInfo {
        pid,
        name,
        executable,
        bundle_id: None,
    }
}

#[cfg(any(target_os = "linux", test))]
fn parse_pactl_json(input: &str) -> Option<MicUsage> {
    let streams = serde_json::from_str::<serde_json::Value>(input).ok()?.as_array()?.clone();
    let mut processes = Vec::new();
    let mut active = false;
    for stream in streams {
        let Some(stream) = stream.as_object() else { continue };
        let is_active = match stream.get("corked").and_then(serde_json::Value::as_bool) {
            Some(corked) => !corked,
            None => stream
                .get("state")
                .and_then(serde_json::Value::as_str)
                .map(|state| state.eq_ignore_ascii_case("running"))
                .unwrap_or(true),
        };
        if !is_active {
            continue;
        }
        active = true;
        if let Some(properties) = stream.get("properties").and_then(serde_json::Value::as_object) {
            let process = process_from_properties(properties);
            if !processes.contains(&process) {
                processes.push(process);
            }
        }
    }
    Some(MicUsage { active, processes })
}

#[cfg(any(target_os = "linux", test))]
fn unquote_pactl_value(value: &str) -> String {
    let value = value.trim();
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value)
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
}

#[cfg(any(target_os = "linux", test))]
fn parse_pactl_text(input: &str) -> Option<MicUsage> {
    let mut saw_stream = false;
    let mut streams: Vec<(bool, serde_json::Map<String, serde_json::Value>)> = Vec::new();
    let mut current: Option<(bool, serde_json::Map<String, serde_json::Value>)> = None;

    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Source Output #") {
            saw_stream = true;
            if let Some(stream) = current.take() {
                streams.push(stream);
            }
            current = Some((true, serde_json::Map::new()));
            continue;
        }
        let Some((active, properties)) = current.as_mut() else {
            continue;
        };
        if let Some(value) = trimmed.strip_prefix("Corked:") {
            *active = !value.trim().eq_ignore_ascii_case("yes");
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if matches!(
            key,
            "application.name" | "application.process.binary" | "application.process.id" | "media.name"
        ) {
            properties.insert(key.to_string(), serde_json::Value::String(unquote_pactl_value(value)));
        }
    }
    if let Some(stream) = current {
        streams.push(stream);
    }
    if !saw_stream {
        return None;
    }

    let mut processes = Vec::new();
    let mut active = false;
    for (stream_active, properties) in streams {
        if !stream_active {
            continue;
        }
        active = true;
        let process = process_from_properties(&properties);
        if !processes.contains(&process) {
            processes.push(process);
        }
    }
    Some(MicUsage { active, processes })
}

#[cfg(any(target_os = "windows", test))]
fn decode_windows_executable_key(key: &str) -> String {
    key.replace('#', "\\")
}

#[cfg(target_os = "windows")]
mod platform {
    use crate::{MicUsage, ProcessInfo};
    use std::path::Path;
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    const CONSENT_STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    fn is_active(key: &RegKey) -> bool {
        matches!(key.get_value::<u64, _>("LastUsedTimeStop"), Ok(0))
    }

    fn nonpackaged_owner(owner_key: &str) -> ProcessInfo {
        let executable = super::decode_windows_executable_key(owner_key);
        let name = Path::new(&executable)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or(owner_key)
            .to_string();
        ProcessInfo {
            pid: None,
            name,
            executable: Some(executable),
            bundle_id: None,
        }
    }

    fn collect_nonpackaged(key: &RegKey, owner: Option<&str>, processes: &mut Vec<ProcessInfo>) {
        if is_active(key) {
            if let Some(owner) = owner {
                let process = nonpackaged_owner(owner);
                if !processes.contains(&process) {
                    processes.push(process);
                }
            }
        }
        for child_name in key.enum_keys().flatten() {
            if let Ok(child) = key.open_subkey(&child_name) {
                collect_nonpackaged(&child, owner.or(Some(&child_name)), processes);
            }
        }
    }

    fn attach_pids(processes: &mut [ProcessInfo]) {
        let mut system = System::new();
        system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
        );
        for owner in processes {
            let Some(expected) = owner.executable.as_deref() else {
                continue;
            };
            owner.pid = system.processes().values().find_map(|process| {
                let actual = process.exe()?.to_string_lossy();
                actual.eq_ignore_ascii_case(expected).then(|| process.pid().as_u32())
            });
        }
    }

    pub(super) fn current_usage() -> MicUsage {
        let Ok(store) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(CONSENT_STORE) else {
            return MicUsage::default();
        };
        let mut processes = Vec::new();
        for child_name in store.enum_keys().flatten() {
            let Ok(child) = store.open_subkey(&child_name) else {
                continue;
            };
            if child_name.eq_ignore_ascii_case("NonPackaged") {
                collect_nonpackaged(&child, None, &mut processes);
            } else if is_active(&child) {
                processes.push(ProcessInfo {
                    pid: None,
                    name: child_name.clone(),
                    executable: None,
                    bundle_id: Some(child_name),
                });
            }
        }
        attach_pids(&mut processes);
        MicUsage {
            active: !processes.is_empty(),
            processes,
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use crate::MicUsage;
    use std::process::Command;

    fn output(args: &[&str]) -> Option<String> {
        let output = Command::new("pactl").args(args).output().ok()?;
        output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
    }

    pub(super) fn current_usage() -> MicUsage {
        if let Some(usage) = output(&["-f", "json", "list", "source-outputs"])
            .as_deref()
            .and_then(super::parse_pactl_json)
        {
            return usage;
        }
        output(&["list", "source-outputs"])
            .as_deref()
            .and_then(super::parse_pactl_text)
            .unwrap_or_default()
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use crate::MicUsage;
    use coreaudio_sys::{
        kAudioDevicePropertyDeviceIsRunningSomewhere, kAudioHardwarePropertyDefaultInputDevice, kAudioObjectPropertyElementMain,
        kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, AudioDeviceID, AudioObjectGetPropertyData,
        AudioObjectPropertyAddress,
    };
    use std::{ffi::c_void, mem::size_of, ptr};

    unsafe fn property<T: Copy>(object: u32, selector: u32, value: &mut T) -> bool {
        let address = AudioObjectPropertyAddress {
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size = size_of::<T>() as u32;
        unsafe {
            AudioObjectGetPropertyData(object, &address, 0, ptr::null(), &mut size, value as *mut T as *mut c_void) == 0
                && size as usize == size_of::<T>()
        }
    }

    pub(super) fn current_usage() -> MicUsage {
        let mut device: AudioDeviceID = 0;
        if !unsafe {
            property(
                kAudioObjectSystemObject,
                kAudioHardwarePropertyDefaultInputDevice,
                &mut device,
            )
        } || device == 0
        {
            return MicUsage::default();
        }
        let mut running: u32 = 0;
        let active = unsafe { property(device, kAudioDevicePropertyDeviceIsRunningSomewhere, &mut running) } && running != 0;
        MicUsage {
            active,
            processes: Vec::new(),
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
mod platform {
    use crate::MicUsage;

    pub(super) fn current_usage() -> MicUsage {
        MicUsage::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_active_and_corked_pactl_json_streams() {
        let input = r#"[
          {"corked": false, "properties": {
            "application.name": "Firefox", "application.process.binary": "firefox", "application.process.id": "42"
          }},
          {"corked": true, "properties": {"application.name": "Ignored"}}
        ]"#;
        let usage = parse_pactl_json(input).unwrap();
        assert!(usage.active);
        assert_eq!(usage.processes.len(), 1);
        assert_eq!(usage.processes[0].pid, Some(42));
        assert_eq!(usage.processes[0].executable.as_deref(), Some("firefox"));
    }

    #[test]
    fn rejects_malformed_json_and_parses_text_fallback() {
        assert!(parse_pactl_json("not json").is_none());
        let text = r#"
Source Output #17
    Corked: no
    Properties:
        application.name = "Microsoft Teams"
        application.process.binary = "ms-teams"
        application.process.id = "501"
Source Output #18
    Corked: yes
    Properties:
        application.name = "Muted"
"#;
        let usage = parse_pactl_text(text).unwrap();
        assert!(usage.active);
        assert_eq!(usage.processes.len(), 1);
        assert_eq!(usage.processes[0].name, "Microsoft Teams");
        assert_eq!(usage.processes[0].pid, Some(501));
        assert!(parse_pactl_text("garbage").is_none());
    }

    #[test]
    fn decodes_windows_nonpackaged_executable_keys() {
        assert_eq!(
            decode_windows_executable_key(r"C:#Program Files#Zoom#bin#Zoom.exe"),
            r"C:\Program Files\Zoom\bin\Zoom.exe"
        );
    }
}
