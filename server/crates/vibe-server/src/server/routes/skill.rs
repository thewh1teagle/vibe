use axum::http::{header, HeaderMap};
use axum::response::IntoResponse;

const TEMPLATE: &str = r#"# Sona Local Transcription API

You are using Sona, a local whisper.cpp transcription HTTP API.

Base URL: {{base_url}}
OpenAPI schema: {{base_url}}/openapi.json
Swagger docs: {{base_url}}/docs

Before calling the API, fetch the OpenAPI schema from /openapi.json and use it as the source of truth for routes, request fields, response shapes, errors, and supported options.

Recommended flow:

1. Call GET /health.
2. Call GET /ready.
3. If the server is not ready, load a model with the model loading endpoint described in /openapi.json.
4. Transcribe audio with the transcription endpoint described in /openapi.json.
5. Prefer the OpenAPI schema over this document whenever details differ.

Example:

~~~sh
curl {{base_url}}/health
curl {{base_url}}/openapi.json
~~~

If the API returns no_model, ask the user for a local whisper.cpp ggml model path and load it before transcribing.
"#;

#[utoipa::path(
    get,
    path = "/skill",
    responses((status = 200, description = "Agent instructions", content_type = "text/markdown"))
)]
pub(in crate::server) async fn skill(headers: HeaderMap) -> impl IntoResponse {
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("127.0.0.1");
    (
        [("content-type", "text/markdown; charset=utf-8")],
        TEMPLATE.replace("{{base_url}}", &format!("http://{host}")),
    )
}
