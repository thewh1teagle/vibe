use std::collections::HashMap;
use std::path::Path;

use axum::extract::multipart::Field;
use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use axum::response::Response;
use tokio::io::AsyncWriteExt;

use crate::server::transcription::TranscriptionRequest;
use crate::server::{error, AppState, MAX_UPLOAD_SIZE};

/// Every form field but `file` is a short option (a language, a path, a prompt).
const MAX_FIELD_SIZE: usize = 64 << 10;

#[derive(Clone, Copy)]
struct Limits {
    file: usize,
    field: usize,
}

const LIMITS: Limits = Limits {
    file: MAX_UPLOAD_SIZE,
    field: MAX_FIELD_SIZE,
};

#[utoipa::path(
    post,
    path = "/v1/audio/transcriptions",
    responses(
        (status = 200, description = "Transcription result"),
        (status = 400, description = "Invalid request/audio", body = crate::server::ErrorResponse),
        (status = 429, description = "Busy", body = crate::server::ErrorResponse),
        (status = 503, description = "No model loaded", body = crate::server::ErrorResponse)
    )
)]
pub(in crate::server) async fn transcriptions(State(state): State<AppState>, multipart: Multipart) -> Response {
    // The upload is read before the model is taken: a slow upload must not hold the lock
    // and turn every other request away as busy while the bytes trickle in.
    let request = match parse_multipart(multipart, LIMITS, &std::env::temp_dir()).await {
        Ok(request) => request,
        Err(response) => return response,
    };
    let model = match state.unload_timeout.try_acquire(state.inner.clone()) {
        Ok(model) => model,
        Err(_) => {
            return error(
                StatusCode::TOO_MANY_REQUESTS,
                "busy",
                "server is busy with another transcription",
            );
        }
    };
    match crate::server::transcription::transcribe(state.config, model, request).await {
        Ok(response) => response,
        Err(response) => response,
    }
}

fn invalid(message: &str) -> Response {
    error(StatusCode::BAD_REQUEST, "invalid_request", message)
}

/// Read the form. The `file` field goes straight to a temp file as it arrives, so the
/// upload is never held in memory; that file is deleted when the returned request drops,
/// and on every early return here, including a client that disconnects mid-upload (the
/// handler future is dropped, and the temp path with it).
async fn parse_multipart(mut multipart: Multipart, limits: Limits, dir: &Path) -> Result<TranscriptionRequest, Response> {
    let mut file = None;
    let mut form = HashMap::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| invalid(&format!("invalid multipart form: {err}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            // A repeated field replaces the earlier one, whose temp file is removed here.
            file = Some(save_to_temp_file(field, limits.file, dir).await?);
        } else {
            let value = read_text(field, limits.field)
                .await
                .map_err(|message| invalid(&format!("form field '{name}': {message}")))?;
            form.insert(name, value);
        }
    }

    let file = file.ok_or_else(|| invalid("missing or invalid 'file' field"))?;
    Ok(TranscriptionRequest { file, form })
}

async fn save_to_temp_file(mut field: Field<'_>, limit: usize, dir: &Path) -> Result<tempfile::TempPath, Response> {
    let failed = |err: std::io::Error| {
        tracing::error!("failed to store upload: {err}");
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            &format!("failed to store uploaded file: {err}"),
        )
    };
    let (file, path) = tempfile::Builder::new()
        .prefix("vibe-upload-")
        .tempfile_in(dir)
        .map_err(failed)?
        .into_parts();
    let mut file = tokio::fs::File::from_std(file);
    let mut size = 0usize;
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|err| invalid(&format!("missing or invalid 'file' field: {err}")))?
    {
        size = size.saturating_add(chunk.len());
        if size > limit {
            return Err(invalid("uploaded file is too large"));
        }
        file.write_all(&chunk).await.map_err(failed)?;
    }
    file.flush().await.map_err(failed)?;
    // Close the handle before ffmpeg opens the path (Windows sharing rules).
    drop(file.into_std().await);
    Ok(path)
}

async fn read_text(mut field: Field<'_>, limit: usize) -> Result<String, String> {
    let mut value = Vec::new();
    while let Some(chunk) = field.chunk().await.map_err(|err| err.to_string())? {
        if value.len() + chunk.len() > limit {
            return Err(format!("larger than {limit} bytes"));
        }
        value.extend_from_slice(&chunk);
    }
    // As before, a value that is not text reads as empty, i.e. not set.
    Ok(String::from_utf8(value).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use axum::body::{Body, Bytes};
    use axum::extract::FromRequest;
    use axum::http::Request;

    use super::*;

    const BOUNDARY: &str = "vibe-test-boundary";

    fn part(name: &str, filename: Option<&str>, body: &[u8]) -> Vec<u8> {
        let disposition = match filename {
            Some(filename) => format!("form-data; name=\"{name}\"; filename=\"{filename}\""),
            None => format!("form-data; name=\"{name}\""),
        };
        let mut out = format!("--{BOUNDARY}\r\nContent-Disposition: {disposition}\r\n\r\n").into_bytes();
        out.extend_from_slice(body);
        out.extend_from_slice(b"\r\n");
        out
    }

    fn end() -> Vec<u8> {
        format!("--{BOUNDARY}--\r\n").into_bytes()
    }

    async fn multipart(body: Body) -> Multipart {
        let request = Request::post("/")
            .header("content-type", format!("multipart/form-data; boundary={BOUNDARY}"))
            .body(body)
            .unwrap();
        Multipart::from_request(request, &()).await.unwrap()
    }

    const SMALL: Limits = Limits { file: 1024, field: 64 };

    #[tokio::test]
    async fn file_and_fields_are_read_and_the_temp_file_goes_with_the_request() {
        let dir = tempfile::tempdir().unwrap();
        let mut body = part("language", None, b"en");
        body.extend(part("file", Some("a.wav"), b"RIFF-not-really"));
        body.extend(end());
        let request = parse_multipart(multipart(Body::from(body)).await, SMALL, dir.path())
            .await
            .ok()
            .unwrap();
        assert_eq!(request.form.get("language").map(String::as_str), Some("en"));
        let path: PathBuf = request.file.to_path_buf();
        assert_eq!(std::fs::read(&path).unwrap(), b"RIFF-not-really");
        drop(request);
        assert!(!path.exists(), "temp file left behind after success");
        assert!(is_empty(&dir));
    }

    /// The body is a 25 MB stream against a 1 KiB limit; it must be refused a little past
    /// the limit, not after pulling (and holding) the whole thing. Chunks arrive one per poll
    /// as they would off a socket (multer drains whatever is ready at once).
    #[tokio::test]
    async fn an_oversized_file_is_rejected_while_streaming() {
        let pulled = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&pulled);
        let head = part("file", Some("big.bin"), b"");
        let head = Bytes::from(head[..head.len() - 2].to_vec());
        let chunks = futures_util::stream::iter(0..100_000usize).then(move |i| {
            counter.fetch_add(1, Ordering::SeqCst);
            let head = head.clone();
            async move {
                tokio::task::yield_now().await;
                Ok::<_, std::io::Error>(if i == 0 { head } else { Bytes::from(vec![b'x'; 256]) })
            }
        });
        let dir = tempfile::tempdir().unwrap();
        let result = parse_multipart(multipart(Body::from_stream(chunks)).await, SMALL, dir.path()).await;
        let response = result.err().expect("oversized upload accepted");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(
            pulled.load(Ordering::SeqCst) < 50,
            "read {} chunks",
            pulled.load(Ordering::SeqCst)
        );
        assert!(is_empty(&dir), "temp file left behind after error");
    }

    #[tokio::test]
    async fn a_body_that_ends_mid_file_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let mut body = part("file", Some("a.wav"), b"partial");
        body.truncate(body.len() - 2);
        let result = parse_multipart(multipart(Body::from(body)).await, SMALL, dir.path()).await;
        assert!(result.is_err());
        assert!(is_empty(&dir), "temp file left behind after a cut-off upload");
    }

    #[tokio::test]
    async fn an_oversized_form_field_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut body = part("prompt", None, &[b'a'; 65]);
        body.extend(part("file", Some("a.wav"), b"data"));
        body.extend(end());
        let response = parse_multipart(multipart(Body::from(body)).await, SMALL, dir.path())
            .await
            .err()
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn a_missing_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut body = part("language", None, b"en");
        body.extend(end());
        let response = parse_multipart(multipart(Body::from(body)).await, SMALL, dir.path())
            .await
            .err()
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    /// A client that goes away mid-upload: the server drops the handler future while the
    /// file is half written, and the temp file must go with it.
    #[tokio::test]
    async fn a_disconnect_mid_upload_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let head = Bytes::from(part("file", Some("a.wav"), b"first bytes"));
        let head = head.slice(..head.len() - 2);
        let chunks = futures_util::stream::iter([Ok::<_, std::io::Error>(head)]).chain(futures_util::stream::pending());
        let parse = parse_multipart(multipart(Body::from_stream(chunks)).await, SMALL, dir.path());
        let mut parse = Box::pin(parse);
        let pending = tokio::time::timeout(std::time::Duration::from_millis(100), &mut parse).await;
        assert!(pending.is_err(), "upload finished without its end");
        assert!(!is_empty(&dir), "upload was not being written to disk");
        drop(parse);
        assert!(is_empty(&dir), "temp file left behind after a disconnect");
    }

    fn is_empty(dir: &tempfile::TempDir) -> bool {
        std::fs::read_dir(dir.path()).unwrap().next().is_none()
    }

    use futures_util::StreamExt;
}
