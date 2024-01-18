use anyhow::{bail, Ok, Result};
use log::debug;
use sha256::digest;
use std::{
    io::{Read, Seek},
    path::PathBuf,
};

pub fn fast_hash(path: PathBuf) -> Result<String> {
    debug!("hashing file at {}", path.display());
    if !path.exists() {
        bail!("path {} does not exists!", path.display())
    }
    let mut file = std::fs::File::open(path)?;
    let size = file.seek(std::io::SeekFrom::End(0))?;
    let mut buf = Vec::new();
    file.seek(std::io::SeekFrom::Start(0))?; // seek back
    if size < 1_000_000 {
        // if less than 1MB just read the whole file
        // hash it all
        debug!("file size smaller than max size, hashing whole file");
        file.read_to_end(&mut buf)?;
    } else {
        // too big file, take 1KB from start and end
        debug!("file size too big, hashing part of file");
        const CHUNK_SIZE: u64 = 1024;

        // Read 1KB from the start
        let cloned_file = file.try_clone()?;
        cloned_file.take(CHUNK_SIZE).read(&mut buf)?;
        // Read 1KB from the end
        file.seek(std::io::SeekFrom::End(CHUNK_SIZE as i64))?;
        let mut buf_end = Vec::new();
        file.read_to_end(&mut buf_end)?;
        // Combine the two chunks
        buf.extend(buf_end);
    }
    let hash = digest(&buf);
    debug!("file hash is {hash}");
    Ok(hash)
}