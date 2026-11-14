//! Keeps paths that arrive from the webview inside the models folder, which may be a folder the
//! user picked. A path counts as inside when it is an absolute, `..`-free direct child of the
//! folder once both are canonicalized. A download destination must also not be a symlink.

use eyre::{bail, Context, ContextCompat, Result};
use std::path::{Component, Path, PathBuf};

/// Resolve `path` to the real location of a direct child of `folder`, or fail.
pub fn resolve_in_folder(folder: &Path, path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        bail!("{} is not an absolute path", path.display());
    }
    if path.components().any(|component| matches!(component, Component::ParentDir)) {
        bail!("{} must not contain '..'", path.display());
    }
    let file_name = path.file_name().context(format!("{} has no file name", path.display()))?;
    let parent = path.parent().context(format!("{} has no parent folder", path.display()))?;
    let folder = std::fs::canonicalize(folder).context(format!("Failed to resolve the models folder {}", folder.display()))?;
    let parent = std::fs::canonicalize(parent).context(format!("Failed to resolve {}", parent.display()))?;
    if parent != folder {
        bail!("{} is outside the models folder {}", path.display(), folder.display());
    }
    Ok(parent.join(file_name))
}

fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
}

/// A download destination: inside the models folder and named like model weights, so a download
/// can never replace another file the app keeps there (the yt-dlp binary, the settings store).
pub fn resolve_model_destination(folder: &Path, path: &Path) -> Result<PathBuf> {
    let is_weights = matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("bin") | Some("gguf")
    );
    if !is_weights {
        bail!("{} is not a .bin or .gguf model file", path.display());
    }
    let resolved = resolve_in_folder(folder, path)?;
    // The download writes `<name>.part` and renames it over `<name>`; a symlink at either would
    // send the bytes outside the folder.
    let mut partial = resolved.as_os_str().to_os_string();
    partial.push(".part");
    if is_symlink(&resolved) || is_symlink(Path::new(&partial)) {
        bail!("{} is a symlink", path.display());
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::{resolve_in_folder, resolve_model_destination};
    use std::{fs, path::PathBuf, time::SystemTime};

    fn test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("vibe-model-paths-{name}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_a_direct_child_even_before_it_exists() {
        let dir = test_dir("inside");
        let resolved = resolve_model_destination(&dir, &dir.join("ggml-tiny.bin")).unwrap();
        assert_eq!(resolved, fs::canonicalize(&dir).unwrap().join("ggml-tiny.bin"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_parent_dir_relative_and_other_folders() {
        let dir = test_dir("escape");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        assert!(resolve_in_folder(&sub, &sub.join("..").join("sub").join("model.bin")).is_err());
        assert!(resolve_in_folder(&sub, &dir.join("model.bin")).is_err());
        assert!(resolve_in_folder(&sub, &std::env::temp_dir().join("model.bin")).is_err());
        assert!(resolve_in_folder(&sub, std::path::Path::new("model.bin")).is_err());
        assert!(resolve_in_folder(&dir, &sub.join("model.bin")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn download_destinations_must_be_model_weights() {
        let dir = test_dir("extension");
        assert!(resolve_model_destination(&dir, &dir.join("model.GGUF")).is_ok());
        assert!(resolve_model_destination(&dir, &dir.join("yt-dlp_macos")).is_err());
        assert!(resolve_model_destination(&dir, &dir.join("app_config.json")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_out_of_the_folder() {
        let dir = test_dir("symlink");
        let models = dir.join("models");
        let elsewhere = dir.join("elsewhere");
        fs::create_dir_all(&models).unwrap();
        fs::create_dir_all(&elsewhere).unwrap();
        std::os::unix::fs::symlink(&elsewhere, models.join("link")).unwrap();
        std::os::unix::fs::symlink(elsewhere.join("target.bin"), models.join("model.bin")).unwrap();

        assert!(resolve_in_folder(&models, &models.join("link").join("model.bin")).is_err());
        assert!(resolve_model_destination(&models, &models.join("model.bin")).is_err());
        std::os::unix::fs::symlink(elsewhere.join("other.bin"), models.join("other.bin.part")).unwrap();
        assert!(resolve_model_destination(&models, &models.join("other.bin")).is_err());
        // Reading a symlinked model (check_model_files) is still allowed.
        assert!(resolve_in_folder(&models, &models.join("model.bin")).is_ok());
        // A models folder that is itself a symlink still works: both sides canonicalize alike.
        let alias = dir.join("alias");
        std::os::unix::fs::symlink(&models, &alias).unwrap();
        assert!(resolve_in_folder(&alias, &models.join("ggml.bin")).is_ok());
        fs::remove_dir_all(dir).unwrap();
    }
}
