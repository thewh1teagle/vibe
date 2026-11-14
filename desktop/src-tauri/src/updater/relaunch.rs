//! Restarting into the version that was just installed, and knowing afterwards that it happened.
//!
//! Before the app goes down it leaves a small marker. The copy that comes up reads it to tell the
//! user what changed, to report whether the install took, and to come back in front: every
//! install is one the user asked for.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MARKER_FILE: &str = "update-relaunch.json";
/// A marker older than this was left by a restart that never happened; a later, ordinary launch
/// must open normally.
const MARKER_MAX_AGE_SECS: u64 = 10 * 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub from: String,
    pub to: String,
    /// Seconds since the Unix epoch.
    pub written_at: u64,
}

impl Marker {
    pub fn new(from: &str, to: &str) -> Self {
        Self {
            from: from.to_string(),
            to: to.to_string(),
            written_at: super::memory::now_secs(),
        }
    }

    pub fn is_fresh(&self, now: u64) -> bool {
        now.saturating_sub(self.written_at) <= MARKER_MAX_AGE_SECS
    }
}

fn marker_path(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_config_dir().ok()?.join(MARKER_FILE))
}

pub fn write(app: &AppHandle, marker: &Marker) -> std::io::Result<()> {
    let path = marker_path(app).ok_or_else(|| std::io::Error::other("no config directory"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_vec(marker).map_err(std::io::Error::other)?)
}

/// Remove the marker: the restart it was written for did not happen.
pub fn discard(app: &AppHandle) {
    if let Some(path) = marker_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

/// Read and remove the marker a previous copy left. `None` when the last exit was not an update.
pub fn take(app: &AppHandle) -> Option<Marker> {
    let path = marker_path(app)?;
    let bytes = std::fs::read(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    serde_json::from_slice(&bytes).ok()
}

/// `…/Vibe.app/Contents/MacOS/vibe` → `…/Vibe.app`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn bundle_of(executable: &Path) -> Option<PathBuf> {
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let is_bundle = macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension().is_some_and(|extension| extension == "app");
    is_bundle.then(|| bundle.to_path_buf())
}

/// Start the installed version and leave. Never returns on success.
///
/// On macOS the new copy is started by a small helper, through `open`: it must start only after
/// this one has gone (one instance at a time), and `open` is what brings an application to the
/// front. A copy started directly as a child process stays behind whatever is on screen.
pub fn restart(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        if let Some(bundle) = std::env::current_exe().ok().and_then(|exe| bundle_of(&exe)) {
            let arguments: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
            // Arguments travel as positional parameters, never inside the script text.
            let script = r#"pid=$1; app=$2; shift 2
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
if [ "$#" -gt 0 ]; then exec /usr/bin/open "$app" --args "$@"; else exec /usr/bin/open "$app"; fi"#;
            let spawned = std::process::Command::new("/bin/sh")
                .arg("-c")
                .arg(script)
                .arg("vibe-relaunch")
                .arg(std::process::id().to_string())
                .arg(&bundle)
                .args(arguments)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();
            match spawned {
                Ok(_) => {
                    app.exit(0);
                    return;
                }
                Err(error) => tracing::warn!("relaunch helper failed, restarting directly: {error}"),
            }
        }
    }
    app.request_restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn marker() -> Marker {
        Marker {
            from: "3.3.6".into(),
            to: "3.3.7".into(),
            written_at: 1_000,
        }
    }

    #[test]
    fn an_old_marker_is_ignored() {
        assert!(marker().is_fresh(1_000 + MARKER_MAX_AGE_SECS));
        assert!(!marker().is_fresh(1_000 + MARKER_MAX_AGE_SECS + 1));
        // A clock that went backwards must not make a marker look ancient.
        assert!(marker().is_fresh(500));
    }

    #[test]
    fn the_marker_survives_a_round_trip_and_ignores_fields_older_versions_wrote() {
        let text = serde_json::to_string(&marker()).unwrap();
        assert_eq!(serde_json::from_str::<Marker>(&text).unwrap(), marker());
        let with_more = text.replace('}', ",\"interactive\":true}");
        assert_eq!(serde_json::from_str::<Marker>(&with_more).unwrap(), marker());
    }

    #[test]
    fn finds_the_bundle_only_for_a_bundled_executable() {
        assert_eq!(
            bundle_of(Path::new("/Applications/vibe.app/Contents/MacOS/vibe")),
            Some(PathBuf::from("/Applications/vibe.app"))
        );
        assert_eq!(bundle_of(Path::new("/repo/target/debug/vibe")), None);
        assert_eq!(bundle_of(Path::new("/Applications/vibe.app/Contents/Resources/vibe")), None);
        assert_eq!(bundle_of(Path::new("/x/Contents/MacOS/vibe")), None);
    }
}
