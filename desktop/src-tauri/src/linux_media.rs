//! Audio and video playback on Linux.
//!
//! The player loads recordings from `asset://` URLs. WebKitGTK hands media URLs to GStreamer,
//! and GStreamer has no element that can read that scheme, so the play button did nothing
//! (#1711). The Linux packages carry Tauri's GStreamer plugin for it
//! (tauri-apps/tauri-gstreamer-plugin, fetched by `chore setup`); this points GStreamer at it.
//!
//! The directory is the one Tauri's own bundler support installs to (tauri-apps/tauri#15965),
//! `<prefix>/lib/<name>/gstreamer-1.0`, so this module can go once that ships.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

const PLUGIN_FILE: &str = "libgsttauriasset.so";
const SCHEME: &str = "asset";

/// WebKit's web process inherits the environment when it is spawned, and GStreamer reads
/// these once, so this must run before the first window exists.
pub fn enable_asset_playback() {
    let Some(dir) = std::env::current_exe().ok().and_then(|exe| plugin_dir(&exe)) else {
        return;
    };
    std::env::set_var("GST_PLUGIN_PATH", prepend_path(&dir, std::env::var_os("GST_PLUGIN_PATH")));
    // Newer WebKitGTK refuses a scheme it does not know even when an element can read it.
    let allowed = std::env::var("WEBKIT_GST_ALLOWED_URI_PROTOCOLS").ok();
    std::env::set_var("WEBKIT_GST_ALLOWED_URI_PROTOCOLS", allow_scheme(allowed.as_deref()));
}

/// The plugin's directory for an executable at `<prefix>/bin/<name>`, when the plugin is there.
/// A development build has none, and playback stays as it was.
fn plugin_dir(exe: &Path) -> Option<PathBuf> {
    let dir = exe
        .parent()?
        .parent()?
        .join("lib")
        .join(exe.file_name()?)
        .join("gstreamer-1.0");
    dir.join(PLUGIN_FILE).is_file().then_some(dir)
}

/// Ours first, and whatever the user or a wrapper had set is kept.
fn prepend_path(dir: &Path, existing: Option<OsString>) -> OsString {
    let mut value = dir.as_os_str().to_owned();
    if let Some(existing) = existing.filter(|existing| !existing.is_empty()) {
        value.push(":");
        value.push(existing);
    }
    value
}

fn allow_scheme(existing: Option<&str>) -> String {
    match existing.map(str::trim).filter(|existing| !existing.is_empty()) {
        Some(existing) if existing.split(',').any(|scheme| scheme.trim() == SCHEME) => existing.to_string(),
        Some(existing) => format!("{existing},{SCHEME}"),
        None => SCHEME.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_plugin_beside_an_installed_binary_only() {
        let root = std::env::temp_dir().join(format!("vibe-linux-media-{}", std::process::id()));
        let exe = root.join("usr/bin/vibe");
        assert_eq!(plugin_dir(&exe), None);

        let dir = root.join("usr/lib/vibe/gstreamer-1.0");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(PLUGIN_FILE), b"").unwrap();
        assert_eq!(plugin_dir(&exe), Some(dir));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn keeps_an_existing_plugin_path_after_ours() {
        let dir = Path::new("/usr/lib/vibe/gstreamer-1.0");
        assert_eq!(prepend_path(dir, None), OsString::from("/usr/lib/vibe/gstreamer-1.0"));
        assert_eq!(
            prepend_path(dir, Some("".into())),
            OsString::from("/usr/lib/vibe/gstreamer-1.0")
        );
        assert_eq!(
            prepend_path(dir, Some("/opt/gst".into())),
            OsString::from("/usr/lib/vibe/gstreamer-1.0:/opt/gst")
        );
    }

    #[test]
    fn adds_the_scheme_once() {
        assert_eq!(allow_scheme(None), "asset");
        assert_eq!(allow_scheme(Some("")), "asset");
        assert_eq!(allow_scheme(Some("rtsp")), "rtsp,asset");
        assert_eq!(allow_scheme(Some("rtsp, asset")), "rtsp, asset");
    }
}
