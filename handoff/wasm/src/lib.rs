//! Browser-side iroh client for Vibe's phone-handoff feature.
//!
//! The phone (PWA) records audio, sends it to the desktop over an iroh
//! bi-directional stream, and streams transcript events back. It can also ask
//! the desktop what it is capable of (`op: "capabilities"`) — the PWA must
//! never hardcode a language list, since that depends on the loaded model.
//!
//! Browsers cannot hole-punch, so all traffic here is relayed. That is expected.

use anyhow::{Context, Result};
use async_channel::Sender;
use iroh::{
    endpoint::{Connection, RecvStream, SendStream},
    Endpoint, EndpointId,
};
use n0_future::{task, Stream, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tracing::level_filters::LevelFilter;
use tracing_subscriber_wasm::MakeConsoleWriter;
use wasm_bindgen::{prelude::wasm_bindgen, JsError, JsValue};
use wasm_streams::{readable::sys::ReadableStream as JsReadableStream, ReadableStream};

/// ALPN for the handoff protocol (see CONTRACT.md).
pub const ALPN: &[u8] = b"vibe/handoff/0";

/// Header is capped by the desktop at 8 KiB.
const MAX_HEADER_LEN: usize = 8192;
/// Total audio is capped by the desktop at 512 MiB.
const MAX_AUDIO_LEN: usize = 512 * 1024 * 1024;
/// How much audio we push per `uploadProgress` event.
const UPLOAD_CHUNK: usize = 256 * 1024;
/// Read buffer for response lines.
const READ_CHUNK: usize = 8192;

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();

    tracing_subscriber::fmt()
        .with_max_level(LevelFilter::DEBUG)
        .with_writer(
            // Avoid trace events in the browser showing their JS backtrace.
            MakeConsoleWriter::default().map_trace_level_to(tracing::Level::DEBUG),
        )
        // Without this we get a runtime error in the browser.
        .without_time()
        .with_ansi(false)
        .init();

    tracing::info!("vibe handoff wasm client loaded");
}

/// The browser-side handoff client. Holds a bound iroh [`Endpoint`].
#[wasm_bindgen]
pub struct HandoffClient {
    endpoint: Endpoint,
}

#[wasm_bindgen]
impl HandoffClient {
    /// Bind a browser endpoint. Relay-only; that is expected.
    pub async fn create() -> Result<HandoffClient, JsError> {
        let endpoint = Endpoint::builder(iroh::endpoint::presets::N0)
            .bind()
            .await
            .context("failed to bind endpoint")
            .map_err(to_js_err)?;
        Ok(HandoffClient { endpoint })
    }

    /// Our own endpoint id, for debugging display.
    pub fn endpoint_id(&self) -> String {
        self.endpoint.id().to_string()
    }

    /// Ask the desktop what it can do.
    ///
    /// Resolves to a single plain JS object, either
    /// `{type:"capabilities", modelLoaded, modelName, languages, languageDetection, translation}`
    /// or `{type:"error", code, message}`. Failures are returned as `error`
    /// objects rather than thrown, so React callers only need one code path.
    pub async fn fetch_capabilities(
        &self,
        endpoint_id: String,
        token: String,
    ) -> Result<JsValue, JsError> {
        let value = match capabilities(&self.endpoint, endpoint_id, token).await {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!("capabilities request failed: {err:#}");
                json!({
                    "type": "error",
                    "code": "transport",
                    "message": format!("{err:#}"),
                })
            }
        };
        to_js(&value).map_err(to_js_err)
    }

    /// Send one recording and stream back transcript events.
    ///
    /// Returns a `ReadableStream` of JS objects: the newline-delimited JSON
    /// events sent by the desktop, plus locally generated
    /// `{"type":"uploadProgress","sent":n,"total":n}` events while uploading.
    /// Transport failures surface as
    /// `{"type":"error","code":"transport","message":"..."}`.
    pub fn send_recording(
        &self,
        endpoint_id: String,
        token: String,
        filename: String,
        mime: String,
        lang: Option<String>,
        translate: bool,
        audio: Vec<u8>,
    ) -> Result<JsReadableStream, JsError> {
        let endpoint_id = parse_endpoint_id(&endpoint_id).map_err(to_js_err)?;
        let header = encode_header(&json!({
            "op": "transcribe",
            "token": token,
            "filename": filename,
            "mime": mime,
            "lang": lang,
            "translate": translate,
        }))
        .map_err(to_js_err)?;

        if audio.len() > MAX_AUDIO_LEN {
            return Err(JsError::new("recording too large (max 512 MiB)"));
        }

        let endpoint = self.endpoint.clone();
        let (tx, rx) = async_channel::bounded::<Value>(32);
        task::spawn(async move {
            if let Err(err) = transcribe(&endpoint, endpoint_id, header, audio, &tx).await {
                tracing::warn!("handoff transfer failed: {err:#}");
                tx.send(json!({
                    "type": "error",
                    "code": "transport",
                    "message": format!("{err:#}"),
                }))
                .await
                .ok();
            }
            tx.close();
        });

        Ok(into_js_readable_stream(rx))
    }
}

/// One request/response round trip carrying no body.
async fn capabilities(endpoint: &Endpoint, endpoint_id: String, token: String) -> Result<Value> {
    let endpoint_id = parse_endpoint_id(&endpoint_id)?;
    // filename/mime are meaningless here but sent as empty strings so the
    // desktop can deserialize one header struct for every op.
    let header = encode_header(&json!({
        "op": "capabilities",
        "token": token,
        "filename": "",
        "mime": "",
        "lang": null,
    }))?;

    let conn = connect(endpoint, endpoint_id).await?;
    let (mut send, mut recv) = conn.open_bi().await.context("failed to open stream")?;
    write_header(&mut send, &header).await?;
    send.finish().context("failed to finish send stream")?;

    let mut lines = Lines::new(&mut recv);
    let value = lines
        .next_line()
        .await?
        .context("desktop closed the stream without answering")?;

    conn.close(0u32.into(), b"bye");
    Ok(value)
}

/// Upload one recording, then stream response events into `tx`.
async fn transcribe(
    endpoint: &Endpoint,
    endpoint_id: EndpointId,
    header: Vec<u8>,
    audio: Vec<u8>,
    tx: &Sender<Value>,
) -> Result<()> {
    let conn = connect(endpoint, endpoint_id).await?;
    let (mut send, mut recv) = conn.open_bi().await.context("failed to open stream")?;
    write_header(&mut send, &header).await?;

    // Raw audio bytes, chunked so we can report upload progress.
    let total = audio.len();
    let mut sent = 0usize;
    tx.send(json!({ "type": "uploadProgress", "sent": 0, "total": total }))
        .await
        .ok();
    while sent < total {
        let end = (sent + UPLOAD_CHUNK).min(total);
        send.write_all(&audio[sent..end])
            .await
            .context("failed to write audio")?;
        sent = end;
        tx.send(json!({ "type": "uploadProgress", "sent": sent, "total": total }))
            .await
            .ok();
    }
    send.finish().context("failed to finish send stream")?;

    // Newline-delimited JSON responses until stream end.
    let mut lines = Lines::new(&mut recv);
    while let Some(value) = lines.next_line().await? {
        tx.send(value).await.ok();
    }

    conn.close(0u32.into(), b"bye");
    Ok(())
}

async fn connect(endpoint: &Endpoint, endpoint_id: EndpointId) -> Result<Connection> {
    endpoint
        .connect(endpoint_id, ALPN)
        .await
        .context("failed to connect to desktop")
}

/// u32-BE header length, then the JSON header itself.
async fn write_header(send: &mut SendStream, header: &[u8]) -> Result<()> {
    send.write_all(&(header.len() as u32).to_be_bytes())
        .await
        .context("failed to write header length")?;
    send.write_all(header)
        .await
        .context("failed to write header")
}

fn encode_header(header: &Value) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(header).context("failed to encode header")?;
    anyhow::ensure!(bytes.len() <= MAX_HEADER_LEN, "handoff header too large");
    Ok(bytes)
}

fn parse_endpoint_id(raw: &str) -> Result<EndpointId> {
    raw.trim().parse().context("failed to parse endpoint id")
}

/// Reads newline-delimited JSON off a [`RecvStream`], one value at a time.
///
/// Malformed lines are logged and skipped rather than killing the transfer.
struct Lines<'a> {
    recv: &'a mut RecvStream,
    buf: Vec<u8>,
    eof: bool,
}

impl<'a> Lines<'a> {
    fn new(recv: &'a mut RecvStream) -> Self {
        Self {
            recv,
            buf: Vec::new(),
            eof: false,
        }
    }

    /// Next parsed JSON value, or `None` once the stream is exhausted.
    async fn next_line(&mut self) -> Result<Option<Value>> {
        let mut chunk = [0u8; READ_CHUNK];
        loop {
            if let Some(pos) = self.buf.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = self.buf.drain(..=pos).collect();
                match parse_line(&line[..line.len() - 1]) {
                    Some(value) => return Ok(Some(value)),
                    None => continue,
                }
            }
            if self.eof {
                // Tolerate a final line with no trailing newline.
                let rest = std::mem::take(&mut self.buf);
                return Ok(parse_line(&rest));
            }
            match self.recv.read(&mut chunk).await.context("failed to read")? {
                Some(0) | None => self.eof = true,
                Some(n) => self.buf.extend_from_slice(&chunk[..n]),
            }
        }
    }
}

fn parse_line(line: &[u8]) -> Option<Value> {
    let line = std::str::from_utf8(line).unwrap_or("").trim();
    if line.is_empty() {
        return None;
    }
    match serde_json::from_str::<Value>(line) {
        Ok(value) => Some(value),
        Err(err) => {
            tracing::warn!("ignoring malformed event line: {err}");
            None
        }
    }
}

fn to_js_err(err: impl Into<anyhow::Error>) -> JsError {
    let err: anyhow::Error = err.into();
    JsError::new(&format!("{err:#}"))
}

/// `json_compatible` maps serde maps to plain JS objects instead of `Map`s.
fn serializer() -> serde_wasm_bindgen::Serializer {
    serde_wasm_bindgen::Serializer::json_compatible()
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue> {
    value
        .serialize(&serializer())
        .map_err(|err| anyhow::anyhow!("failed to convert to JS value: {err}"))
}

fn into_js_readable_stream<T: Serialize>(
    stream: impl Stream<Item = T> + 'static,
) -> JsReadableStream {
    let stream = stream.map(|event| Ok(to_js(&event).unwrap()));
    ReadableStream::from_stream(stream).into_raw()
}
