use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use anyhow::{bail, ensure, Context, Result};
use serde::{Deserialize, Deserializer};
use sha2::{Digest, Sha256};

const MAX_MANIFEST_SIZE: u64 = 64 * 1024;
const HASH_BUFFER_SIZE: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    FunAsrNano,
    SenseVoice,
}

#[derive(Debug)]
pub struct Package {
    pub kind: ModelKind,
    pub model: PathBuf,
    pub encoder: Option<PathBuf>,
    pub revision: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    format_version: u32,
    engine: String,
    revision: String,
    files: ManifestFiles,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManifestFiles {
    model: FileEntry,
    #[serde(default, deserialize_with = "deserialize_encoder")]
    encoder: Option<FileEntry>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FileEntry {
    path: String,
    size: u64,
    sha256: String,
}

fn deserialize_encoder<'de, D>(deserializer: D) -> std::result::Result<Option<FileEntry>, D::Error>
where
    D: Deserializer<'de>,
{
    FileEntry::deserialize(deserializer).map(Some)
}

pub fn is_package_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.to_ascii_lowercase().ends_with(".vibe-model"))
}

impl Package {
    /// Full validation: manifest schema, component paths, sizes, GGUF magic and a complete sha256
    /// pass over every component. Reading gigabytes takes seconds, so reserve this for one-shot
    /// checks, never for anything on a user's click path.
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        Self::load_with_hashing(path, true)
    }

    /// The cheap variant for listing and loading: every check except the sha256 pass, so a
    /// settings page can validate installed packages without hashing gigabytes per click.
    /// Integrity is already enforced where the bytes arrive — `download_model` verifies each
    /// component against the catalog hash before it ever lands in a package.
    pub fn load_shallow(path: impl AsRef<Path>) -> Result<Self> {
        Self::load_with_hashing(path, false)
    }

    fn load_with_hashing(path: impl AsRef<Path>, verify_hashes: bool) -> Result<Self> {
        let path = path.as_ref();
        ensure!(is_package_path(path), "package must use the .vibe-model suffix");
        let metadata = fs::metadata(path).with_context(|| format!("cannot inspect manifest {}", path.display()))?;
        ensure!(metadata.is_file(), "manifest must be a regular file");
        ensure!(metadata.len() <= MAX_MANIFEST_SIZE, "manifest exceeds 64 KiB");

        let file = File::open(path).with_context(|| format!("cannot open manifest {}", path.display()))?;
        ensure!(file.metadata()?.is_file(), "manifest must be a regular file");
        let mut bytes = Vec::new();
        file.take(MAX_MANIFEST_SIZE + 1)
            .read_to_end(&mut bytes)
            .context("cannot read manifest")?;
        ensure!(bytes.len() as u64 <= MAX_MANIFEST_SIZE, "manifest exceeds 64 KiB");
        let manifest: Manifest = serde_json::from_slice(&bytes).context("invalid package manifest")?;
        ensure!(
            manifest.format_version == 1,
            "unsupported format_version: {}",
            manifest.format_version
        );
        ensure!(!manifest.revision.trim().is_empty(), "revision must not be empty");
        let kind = match manifest.engine.as_str() {
            "funasr-nano" => {
                ensure!(manifest.files.encoder.is_some(), "funasr-nano requires encoder");
                ModelKind::FunAsrNano
            }
            "sensevoice" => {
                ensure!(manifest.files.encoder.is_none(), "sensevoice forbids encoder");
                ModelKind::SenseVoice
            }
            engine => bail!("unsupported engine: {engine}"),
        };
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let base = parent
            .canonicalize()
            .with_context(|| format!("cannot resolve manifest directory {}", parent.display()))?;
        let model = validate_file(&base, &manifest.files.model, verify_hashes).context("invalid model file")?;
        let encoder = manifest
            .files
            .encoder
            .as_ref()
            .map(|entry| validate_file(&base, entry, verify_hashes).context("invalid encoder file"))
            .transpose()?;
        Ok(Self {
            kind,
            model,
            encoder,
            revision: manifest.revision,
        })
    }
}

fn validate_file(base: &Path, entry: &FileEntry, verify_hash: bool) -> Result<PathBuf> {
    ensure!(entry.size >= 4, "size must be at least 4 bytes");
    ensure!(
        entry.sha256.len() == 64 && entry.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "sha256 must contain exactly 64 hexadecimal characters"
    );
    let relative = Path::new(&entry.path);
    ensure!(
        !entry.path.is_empty()
            && !relative.is_absolute()
            && !entry.path.contains(['\\', ':', '\0'])
            && entry
                .path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."),
        "path must be relative with no empty, dot, parent, backslash or colon components"
    );
    let resolved = base
        .join(relative)
        .canonicalize()
        .with_context(|| format!("cannot resolve file {}", entry.path))?;
    ensure!(resolved.starts_with(base), "file escapes manifest directory: {}", entry.path);
    let metadata = fs::metadata(&resolved).with_context(|| format!("cannot inspect file {}", resolved.display()))?;
    ensure!(metadata.is_file(), "model component must be a regular file");
    let mut file = File::open(&resolved).with_context(|| format!("cannot open file {}", resolved.display()))?;
    let metadata = file.metadata().context("cannot inspect opened file")?;
    ensure!(metadata.is_file(), "model component must be a regular file");
    ensure!(
        metadata.len() == entry.size,
        "size mismatch: expected {}, found {}",
        entry.size,
        metadata.len()
    );
    let mut magic = [0; 4];
    file.read_exact(&mut magic).context("cannot read GGUF magic")?;
    ensure!(&magic == b"GGUF", "invalid GGUF magic");
    if !verify_hash {
        return Ok(resolved);
    }

    let mut hasher = Sha256::new();
    hasher.update(magic);
    let mut buffer = vec![0; HASH_BUFFER_SIZE];
    let mut total = 4_u64;
    loop {
        let count = match file.read(&mut buffer) {
            Ok(count) => count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error).context("cannot read model component"),
        };
        if count == 0 {
            break;
        }
        total = total.checked_add(count as u64).context("file size overflow")?;
        ensure!(total <= entry.size, "size mismatch: file grew while reading");
        hasher.update(&buffer[..count]);
    }
    ensure!(total == entry.size, "size mismatch: file shrank while reading");
    let actual = format!("{:x}", hasher.finalize());
    ensure!(actual.eq_ignore_ascii_case(&entry.sha256), "sha256 mismatch");
    Ok(resolved)
}

#[cfg(test)]
#[path = "manifest_tests.rs"]
mod tests;
