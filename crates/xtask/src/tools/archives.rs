use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use zip::write::SimpleFileOptions;

pub fn extract_tar_gz(data: &[u8], out_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(out_dir)?;
    let decoder = GzDecoder::new(Cursor::new(data));
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(out_dir)
        .with_context(|| format!("failed to extract archive to {}", out_dir.display()))
}

pub fn read_zip_file(data: &[u8], filename: &str) -> Result<Vec<u8>> {
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = std::path::Path::new(file.name())
            .file_name()
            .unwrap_or_default();
        if name == filename {
            let mut out = Vec::new();
            file.read_to_end(&mut out)?;
            return Ok(out);
        }
    }
    anyhow::bail!("{filename} not found in zip archive")
}

pub fn write_zip_dir(src_dir: &Path, out_path: &Path) -> Result<()> {
    let file = std::fs::File::create(out_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for entry in sorted_entries(src_dir)? {
        let name = entry
            .file_name()
            .context("archive entry has no filename")?
            .to_string_lossy()
            .into_owned();
        zip.start_file(name, options)?;
        std::io::copy(&mut std::fs::File::open(entry)?, &mut zip)?;
    }
    zip.finish()?;
    Ok(())
}

pub fn write_tar_gz_dir(src_dir: &Path, out_path: &Path) -> Result<()> {
    let file = std::fs::File::create(out_path)?;
    let encoder = GzEncoder::new(file, Compression::default());
    let mut tar = tar::Builder::new(encoder);
    for entry in sorted_entries(src_dir)? {
        let name = entry
            .file_name()
            .context("archive entry has no filename")?
            .to_os_string();
        tar.append_path_with_name(&entry, name)?;
    }
    tar.finish()?;
    Ok(())
}

fn sorted_entries(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut entries = std::fs::read_dir(dir)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    entries.sort();
    Ok(entries)
}
