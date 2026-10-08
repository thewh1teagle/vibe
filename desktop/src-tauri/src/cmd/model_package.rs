use eyre::{bail, Context, Result};
use funasr_runtime::manifest::{self, ModelKind, Package};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MANIFEST_NAME: &str = "model.vibe-model";

/// Create the staging folder an in-app native model download lands in. The dot prefix keeps the
/// half-empty directory out of the installed-model listing until the install renames it.
#[tauri::command]
pub fn prepare_model_package_staging(app_handle: tauri::AppHandle) -> Result<String> {
    let models_folder = crate::cmd::app::get_models_folder(app_handle)?;
    let staging = models_folder.join(format!(".download-{}", Uuid::new_v4()));
    fs::create_dir(&staging).context("cannot create download staging directory")?;
    Ok(staging.to_string_lossy().into_owned())
}

/// Turn the components a native model download left in `staging` into an installed package. The
/// files are already verified by `download_model`'s integrity check, so this only writes the
/// manifest, re-validates it through the shallow package check, and renames the folder into place.
#[tauri::command]
pub async fn install_model_package(
    app_handle: tauri::AppHandle,
    staging: String,
    engine: String,
    revision: String,
    model: String,
    encoder: Option<String>,
) -> Result<String> {
    let kind = match engine.as_str() {
        "funasr-nano" => ModelKind::FunAsrNano,
        "sensevoice" => ModelKind::SenseVoice,
        other => bail!("unsupported engine: {other}"),
    };
    if let (ModelKind::FunAsrNano, None) = (kind, encoder.as_deref()) {
        bail!("funasr-nano requires an encoder component");
    }
    if let (ModelKind::SenseVoice, Some(_)) = (kind, encoder.as_deref()) {
        bail!("sensevoice forbids an encoder component");
    }
    let models_folder = crate::cmd::app::get_models_folder(app_handle)?;
    // Writing the manifest hashes every downloaded component, so gigabytes flow through here —
    // a sync command would run that on the main thread and freeze the progress UI.
    tauri::async_runtime::spawn_blocking(move || {
        install_staged(Path::new(&staging), &models_folder, kind, &revision, &model, encoder.as_deref())
    })
    .await
    .context("installing the model package failed on a blocking task")?
}

/// Turn a populated download staging directory into an installed package: write the manifest,
/// validate it against the staged files, then atomically rename the directory to
/// `<engine-slug>-<revision12>` in the models folder. On any failure the staging directory is removed.
fn install_staged(
    staging: &Path,
    models_folder: &Path,
    kind: ModelKind,
    revision: &str,
    model_name: &str,
    encoder_name: Option<&str>,
) -> Result<String> {
    let result = (|| -> Result<()> {
        write_manifest(&staging.join(MANIFEST_NAME), kind, revision, model_name, encoder_name)?;
        validate_installed(&staging.join(MANIFEST_NAME))
    })();

    match result {
        Ok(_) => {
            let final_dir = models_folder.join(format!("{}-{}", engine_slug(kind), short_revision(revision)));
            let final_dir = unique_dir(&final_dir, models_folder);
            fs::rename(staging, &final_dir).context("cannot move package into place")?;
            let manifest_path = final_dir.join(MANIFEST_NAME);
            tracing::info!("installed model package: {}", manifest_path.display());
            Ok(manifest_path.to_string_lossy().into_owned())
        }
        Err(error) => {
            let _ = fs::remove_dir_all(staging);
            Err(error)
        }
    }
}

fn load_package(path: &Path) -> Result<Package> {
    manifest::Package::load_shallow(path).map_err(|error| eyre::eyre!("{error:#}"))
}

/// Describe a downloaded component the way the manifest schema demands: an exact `size` and a full
/// `sha256` for every file entry.
fn file_entry(staging: &Path, name: &str) -> Result<serde_json::Value> {
    let copied = staging.join(name);
    let size = fs::metadata(&copied)
        .with_context(|| format!("cannot inspect copied component {}", copied.display()))?
        .len();
    let sha256 = super::download::sha256_file(&copied)?;
    Ok(serde_json::json!({ "path": name, "size": size, "sha256": sha256 }))
}

fn write_manifest(path: &Path, kind: ModelKind, revision: &str, model_name: &str, encoder_name: Option<&str>) -> Result<()> {
    let engine = engine_slug(kind);
    let staging = path.parent().unwrap_or_else(|| Path::new("."));
    let model = file_entry(staging, model_name)?;
    let encoder = encoder_name.map(|encoder| file_entry(staging, encoder)).transpose()?;
    let files = match encoder {
        Some(encoder) => serde_json::json!({ "model": model, "encoder": encoder }),
        None => serde_json::json!({ "model": model }),
    };
    let manifest = serde_json::json!({
        "format_version": 1,
        "engine": engine,
        "revision": revision,
        "files": files,
    });
    fs::write(path, serde_json::to_string_pretty(&manifest).context("encode manifest")?).context("write manifest")?;
    Ok(())
}

fn validate_installed(manifest_path: &Path) -> Result<()> {
    // `download_model` hash-verified every component against the catalog before it got here, so
    // re-hashing would only repeat gigabytes of work; the shallow check still catches a manifest
    // that does not match the files it points at.
    load_package(manifest_path).with_context(|| format!("installed package failed validation: {}", manifest_path.display()))?;
    Ok(())
}

fn engine_slug(kind: ModelKind) -> &'static str {
    match kind {
        ModelKind::FunAsrNano => "funasr-nano",
        ModelKind::SenseVoice => "sensevoice",
    }
}

fn short_revision(revision: &str) -> String {
    let trimmed = revision.trim();
    if trimmed.len() > 12 {
        trimmed[..12].to_string()
    } else {
        trimmed.to_string()
    }
}

fn unique_dir(preferred: &Path, parent: &Path) -> PathBuf {
    if !preferred.exists() {
        return preferred.to_path_buf();
    }
    let stem = preferred.file_name().unwrap_or_default().to_string_lossy().into_owned();
    for index in 2.. {
        let candidate = parent.join(format!("{stem}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    preferred.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("vibe-model-package-test-{}", Uuid::new_v4()));
            fs::create_dir_all(&dir).expect("create temp dir");
            // `Package::load` canonicalizes, and on macOS the temp dir sits behind the
            // /var -> /private/var symlink, so compare against canonicalized paths too.
            Self(dir.canonicalize().expect("canonicalize temp dir"))
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_fake_gguf(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create component directory");
        }
        // `validate_file` only checks the four-byte magic and size, so a
        // short fake body is enough for a package that passes validation.
        fs::write(path, b"GGUF fake component").expect("write fake gguf");
    }

    #[test]
    fn write_manifest_round_trips_through_validation() {
        let staging = TempDir::new();
        write_fake_gguf(&staging.path().join("sensevoice-small-q8.gguf"));
        write_manifest(
            &staging.path().join(MANIFEST_NAME),
            ModelKind::SenseVoice,
            "rev-sensevoice",
            "sensevoice-small-q8.gguf",
            None,
        )
        .expect("write manifest");

        let package = load_package(&staging.path().join(MANIFEST_NAME)).expect("manifest written by the install must load");
        assert_eq!(package.kind, ModelKind::SenseVoice);
        assert_eq!(package.revision, "rev-sensevoice");
        assert_eq!(package.model, staging.path().join("sensevoice-small-q8.gguf"));
        assert!(package.encoder.is_none());
    }

    #[test]
    fn validate_installed_rejects_a_component_that_no_longer_matches_the_manifest() {
        let staging = TempDir::new();
        write_fake_gguf(&staging.path().join("sensevoice-small-q8.gguf"));
        write_manifest(
            &staging.path().join(MANIFEST_NAME),
            ModelKind::SenseVoice,
            "rev-corrupt",
            "sensevoice-small-q8.gguf",
            None,
        )
        .expect("write manifest");
        // Same magic, different size — the shallow check has to catch a truncated component.
        fs::write(staging.path().join("sensevoice-small-q8.gguf"), b"GGUF cut short").expect("truncate component");

        let error = validate_installed(&staging.path().join(MANIFEST_NAME)).expect_err("truncated copy must fail");
        assert!(
            format!("{error:#}").contains("size mismatch"),
            "unexpected error: {error:#}"
        );
    }

    #[test]
    fn unique_dir_avoids_existing_packages() {
        let parent = TempDir::new();
        let preferred = parent.path().join("sensevoice-rev");
        assert_eq!(unique_dir(&preferred, parent.path()), preferred);
        fs::create_dir(&preferred).expect("create preferred");
        assert_eq!(unique_dir(&preferred, parent.path()), parent.path().join("sensevoice-rev-2"));
    }

    #[test]
    fn install_staged_renames_the_download_folder_into_place() {
        let models = TempDir::new();
        let staging = models.path().join(".download-00000000000000000000000000000000");
        fs::create_dir(&staging).expect("create staging");
        write_fake_gguf(&staging.join("sensevoice-small-q8.gguf"));

        let manifest = install_staged(
            &staging,
            models.path(),
            ModelKind::SenseVoice,
            "rev-20260916",
            "sensevoice-small-q8.gguf",
            None,
        )
        .expect("install staged download");
        assert_eq!(manifest, models.path().join("sensevoice-rev-20260916/model.vibe-model"));
        assert!(!staging.exists(), "the staging folder must be renamed away");
        load_package(Path::new(&manifest)).expect("installed package must load");
    }

    #[test]
    fn install_staged_requires_the_encoder_for_nano_and_cleans_up_on_failure() {
        let models = TempDir::new();
        let staging = models.path().join(".download-00000000000000000000000000000000");
        fs::create_dir(&staging).expect("create staging");
        // The encoder never downloaded, so the staged package is incomplete.
        write_fake_gguf(&staging.join("qwen3-0.6b-q4km.gguf"));

        let error = install_staged(
            &staging,
            models.path(),
            ModelKind::FunAsrNano,
            "rev-nano",
            "qwen3-0.6b-q4km.gguf",
            None,
        )
        .expect_err("nano without an encoder must fail");
        assert!(!staging.exists(), "a failed install must clean the staging folder");
        assert!(
            !models.path().join("funasr-nano-rev-nano").exists(),
            "no package may land in the models folder"
        );
        assert!(format!("{error:#}").contains("encoder"), "unexpected error: {error:#}");
    }
}
