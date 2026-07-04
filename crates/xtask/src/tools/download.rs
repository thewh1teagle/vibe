use std::io::Read;

use anyhow::{Context, Result};

pub fn bytes(url: &str, timeout_seconds: u64) -> Result<Vec<u8>> {
    println!("downloading {url}");
    let response = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(timeout_seconds))
        .build()
        .get(url)
        .call()
        .with_context(|| format!("download failed: {url}"))?;

    let mut data = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut data)
        .with_context(|| format!("failed to read response body: {url}"))?;
    Ok(data)
}
