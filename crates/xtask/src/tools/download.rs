use std::io::Read;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};

const MAX_ATTEMPTS: usize = 4;

pub fn bytes(url: &str, timeout_seconds: u64) -> Result<Vec<u8>> {
    println!("downloading {url}");
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(timeout_seconds))
        .build();
    let mut last_error = None;

    for attempt in 1..=MAX_ATTEMPTS {
        match agent.get(url).call() {
            Ok(response) => {
                let mut data = Vec::new();
                response
                    .into_reader()
                    .read_to_end(&mut data)
                    .with_context(|| format!("failed to read response body: {url}"))?;
                return Ok(data);
            }
            Err(err) => {
                last_error = Some(err);
                if attempt < MAX_ATTEMPTS {
                    let delay = Duration::from_secs(attempt as u64 * 2);
                    eprintln!(
                        "download attempt {attempt}/{MAX_ATTEMPTS} failed, retrying in {}s: {url}",
                        delay.as_secs()
                    );
                    std::thread::sleep(delay);
                }
            }
        }
    }

    Err(anyhow!(
        "download failed after {MAX_ATTEMPTS} attempts: {url}: {}",
        last_error
            .map(|err| err.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}
