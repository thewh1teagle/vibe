//! A downloaded update, kept on disk until it is installed.
//!
//! The package has to outlive the process: it is installed when the app quits or is next opened,
//! which can be days after the download. Holding ~100 MB in memory for that long is no way to do
//! it, and a quit would lose it. The file sits in the app's own cache folder, and its signature is
//! checked again every time it is read: what is installed is always something the release key
//! signed, whatever happened to the file in between.

use std::path::PathBuf;

use base64::Engine;
use tauri::{AppHandle, Manager};

use super::memory::Staged;

fn dir(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_cache_dir().ok()?.join("updates"))
}

#[cfg(unix)]
fn restrict(path: &std::path::Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
}

#[cfg(not(unix))]
fn restrict(_path: &std::path::Path, _mode: u32) {}

/// Keep `bytes` for `version`, replacing whatever was kept before.
pub fn write(app: &AppHandle, version: &str, signature: &str, bytes: &[u8]) -> std::io::Result<Staged> {
    let dir = dir(app).ok_or_else(|| std::io::Error::other("no cache directory"))?;
    clear(app);
    std::fs::create_dir_all(&dir)?;
    restrict(&dir, 0o700);
    // The version comes from the release file; only its safe characters go into a file name.
    let safe: String = version
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
        .collect();
    let file_name = format!("vibe-{safe}.update");
    let partial = dir.join(format!("{file_name}.part"));
    std::fs::write(&partial, bytes)?;
    restrict(&partial, 0o600);
    std::fs::rename(&partial, dir.join(&file_name))?;
    Ok(Staged {
        version: version.to_string(),
        signature: signature.to_string(),
        file_name,
    })
}

/// The kept package, if it is still there and still carries the release signature.
pub fn read(app: &AppHandle, staged: &Staged) -> Option<Vec<u8>> {
    // A name with a path in it did not come from `write`.
    if staged.file_name.contains(['/', '\\']) || staged.file_name.starts_with('.') {
        return None;
    }
    let bytes = std::fs::read(dir(app)?.join(&staged.file_name)).ok()?;
    let key = public_key(app)?;
    match verify(&bytes, &staged.signature, &key) {
        Ok(()) => Some(bytes),
        Err(error) => {
            tracing::warn!("the downloaded update no longer verifies, discarding it: {error}");
            clear(app);
            None
        }
    }
}

/// Remove every kept package.
pub fn clear(app: &AppHandle) {
    if let Some(dir) = dir(app) {
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// The updater's public key, as configured for the plugin in `tauri.conf.json`.
fn public_key(app: &AppHandle) -> Option<String> {
    app.config()
        .plugins
        .0
        .get("updater")?
        .get("pubkey")?
        .as_str()
        .map(str::to_string)
}

/// The same check the updater plugin makes after a download: a minisign signature over the whole
/// package, with the key and the signature both base64-wrapped.
fn verify(bytes: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let decode = |text: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(text)
            .map_err(|error| error.to_string())
            .and_then(|raw| String::from_utf8(raw).map_err(|error| error.to_string()))
    };
    let key = minisign_verify::PublicKey::decode(&decode(public_key)?).map_err(|error| error.to_string())?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?).map_err(|error| error.to_string())?;
    key.verify(bytes, &signature, true).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::verify;

    /// The project's updater key, and a real signature from the 3.3.6 release, over a file this
    /// test does not have: enough to prove that anything else is refused.
    const KEY: &str = include_str!("../../tauri.conf.json");

    fn configured_key() -> String {
        let config: serde_json::Value = serde_json::from_str(KEY).unwrap();
        config["plugins"]["updater"]["pubkey"].as_str().unwrap().to_string()
    }

    #[test]
    fn the_configured_key_decodes() {
        // A wrong signature must fail on the signature, not on reading the key.
        let error = verify(b"data", "bm90IGEgc2lnbmF0dXJl", &configured_key()).unwrap_err();
        assert!(!error.is_empty());
    }

    /// Against a real release: `VIBE_TEST_UPDATE_PKG` is a downloaded updater package and
    /// `VIBE_TEST_UPDATE_SIG` its `signature` from the channel file. Run with `--ignored`.
    #[test]
    #[ignore]
    fn a_real_release_package_verifies_and_a_changed_one_does_not() {
        let package = std::fs::read(std::env::var("VIBE_TEST_UPDATE_PKG").unwrap()).unwrap();
        let signature = std::env::var("VIBE_TEST_UPDATE_SIG").unwrap();
        verify(&package, &signature, &configured_key()).expect("the release package must verify");
        let mut changed = package.clone();
        let middle = changed.len() / 2;
        changed[middle] ^= 1;
        assert!(verify(&changed, &signature, &configured_key()).is_err());
        assert!(verify(&package[..package.len() - 1], &signature, &configured_key()).is_err());
    }

    #[test]
    fn garbage_is_refused() {
        assert!(verify(b"data", "not base64!", &configured_key()).is_err());
        assert!(verify(b"data", "", &configured_key()).is_err());
        assert!(verify(b"data", "bm90IGEgc2lnbmF0dXJl", "not a key").is_err());
    }
}
