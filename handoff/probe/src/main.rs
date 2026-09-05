//! Fake phone for the Vibe handoff protocol.
//!
//! Speaks the exact wire protocol the PWA speaks, but natively, so the desktop
//! receiver can be tested end to end without a browser or a wasm build in the loop.
//!
//!   handoff-probe send --peer <endpoint_id>:<token> --file recording.m4a
//!   handoff-probe send --url 'http://localhost:8088/#<endpoint_id>:<token>' --file a.wav

use anyhow::{bail, Context, Result};
use clap::Parser;
use iroh::{endpoint::presets, Endpoint, EndpointId};
use serde::Serialize;
use std::path::PathBuf;

const ALPN: &[u8] = b"vibe/handoff/0";

#[derive(Parser)]
#[command(about = "Fake phone for the Vibe handoff protocol")]
struct Cli {
    /// Pairing as `<endpoint_id>:<token>`.
    #[arg(long, conflicts_with = "url")]
    peer: Option<String>,

    /// Full pairing URL as encoded in the desktop's QR code.
    #[arg(long)]
    url: Option<String>,

    /// Enroll this probe using the QR invitation before the requested operation.
    #[arg(long)]
    pair: bool,

    /// Credential to enroll/reuse with --pair. Random when omitted.
    #[arg(long, requires = "pair")]
    device_token: Option<String>,

    /// Audio file to send. Not needed with --capabilities.
    #[arg(long, required_unless_present = "capabilities")]
    file: Option<PathBuf>,

    /// Optional whisper language code; omitted means auto-detect.
    #[arg(long)]
    lang: Option<String>,

    /// Ask the desktop what it supports instead of sending audio.
    #[arg(long)]
    capabilities: bool,
}

#[derive(Serialize)]
struct Header {
    op: &'static str,
    token: String,
    filename: String,
    mime: String,
    lang: Option<String>,
}

fn parse_pairing(cli: &Cli) -> Result<(EndpointId, String)> {
    let raw = match (&cli.peer, &cli.url) {
        (Some(peer), _) => peer.clone(),
        (None, Some(url)) => url
            .split_once('#')
            .map(|(_, frag)| frag.to_string())
            .context("pairing URL has no `#<endpoint_id>:<token>` fragment")?,
        (None, None) => bail!("pass either --peer or --url"),
    };

    let (id, token) = raw.split_once(':').context("pairing must look like <endpoint_id>:<token>")?;
    let endpoint_id: EndpointId = id.trim().parse().context("invalid endpoint id")?;
    if token.trim().is_empty() {
        bail!("pairing token is empty");
    }
    Ok((endpoint_id, token.trim().to_string()))
}

fn guess_mime(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "m4a" | "mp4" => "audio/mp4",
        "webm" => "audio/webm",
        "ogg" | "opus" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    let (endpoint_id, mut token) = parse_pairing(&cli)?;
    let endpoint = Endpoint::bind(presets::N0).await?;
    if cli.pair {
        let device_token = cli.device_token.clone().unwrap_or_else(|| {
            iroh::SecretKey::generate().to_bytes()[..16]
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect()
        });
        let header = serde_json::to_vec(&serde_json::json!({
            "op": "pair", "token": token, "deviceToken": device_token, "deviceName": "Handoff probe"
        }))?;
        let connection = endpoint.connect(endpoint_id, ALPN).await?;
        let (mut send, mut receive) = connection.open_bi().await?;
        send.write_all(&(header.len() as u32).to_be_bytes()).await?;
        send.write_all(&header).await?;
        send.finish()?;
        let reply = receive.read_to_end(8192).await?;
        let reply: serde_json::Value = serde_json::from_slice(&reply)?;
        connection.close(0u32.into(), b"bye");
        if reply["type"] != "paired" {
            bail!("pairing failed: {reply}");
        }
        println!("paired probe: {}", reply["deviceId"]);
        token = device_token;
    }

    let (header, audio) = if cli.capabilities {
        let header = serde_json::to_vec(&Header {
            op: "capabilities",
            token,
            filename: String::new(),
            mime: String::new(),
            lang: None,
        })?;
        (header, Vec::new())
    } else {
        let path = cli.file.as_ref().expect("clap enforces --file");
        let audio = tokio::fs::read(path)
            .await
            .with_context(|| format!("failed to read {}", path.display()))?;
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("recording").to_string();
        let header = serde_json::to_vec(&Header {
            op: "transcribe",
            token,
            filename,
            mime: guess_mime(path).to_string(),
            lang: cli.lang.clone(),
        })?;
        (header, audio)
    };

    println!("connecting to {endpoint_id}…");
    let conn = endpoint.connect(endpoint_id, ALPN).await?;
    if cli.capabilities {
        println!("connected; asking for capabilities");
    } else {
        println!("connected; sending {} bytes of audio", audio.len());
    }

    let (mut send, mut recv) = conn.open_bi().await?;
    send.write_all(&(header.len() as u32).to_be_bytes()).await?;
    send.write_all(&header).await?;
    if !audio.is_empty() {
        send.write_all(&audio).await?;
    }
    send.finish()?;

    // Read newline-delimited JSON events until the desktop finishes the stream.
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let mut saw_terminal = false;
    loop {
        let n = match recv.read(&mut chunk).await? {
            Some(0) | None => break,
            Some(n) => n,
        };
        buf.extend_from_slice(&chunk[..n]);
        while let Some(nl) = buf.iter().position(|b| *b == b'\n') {
            let pending = buf.split_off(nl + 1);
            let line = String::from_utf8_lossy(&buf[..nl]).to_string();
            buf = pending;
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(event) => {
                    let kind = event.get("type").and_then(|t| t.as_str()).unwrap_or("?");
                    if kind == "done" || kind == "error" || kind == "capabilities" {
                        saw_terminal = true;
                    }
                    println!("<< {event}");
                }
                Err(e) => println!("<< [unparseable: {e}] {line}"),
            }
        }
    }

    conn.close(0u32.into(), b"bye");
    endpoint.close().await;

    if !saw_terminal {
        bail!("stream ended without a terminal `done` or `error` event");
    }
    println!("ok");
    Ok(())
}
