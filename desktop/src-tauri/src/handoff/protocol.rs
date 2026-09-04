//! Wire types for the phone handoff protocol (`vibe/handoff/0`).
//!
//! One bi-directional stream per transfer. The phone is the connecting side:
//! it writes a `u32` big-endian header length, that many bytes of UTF-8 JSON
//! ([`HandoffHeader`]), then raw audio bytes until it finishes its send stream.
//! The desktop answers with newline-delimited JSON ([`HandoffEvent`]) on the
//! same stream.

use serde::{Deserialize, Serialize};

/// ALPN negotiated by both sides of the handoff.
pub const ALPN: &[u8] = b"vibe/handoff/0";

/// Reject headers larger than this (bytes).
pub const MAX_HEADER_LEN: u32 = 8192;

/// Reject transfers whose audio body exceeds this (bytes).
pub const MAX_AUDIO_BYTES: u64 = 512 * 1024 * 1024;

/// What the phone is asking for. Absent means [`OP_TRANSCRIBE`].
pub const OP_TRANSCRIBE: &str = "transcribe";

/// Ask what the loaded model can do. No audio body follows a capabilities request.
pub const OP_CAPABILITIES: &str = "capabilities";

/// Phases reported by [`HandoffEvent::Status`].
pub const PHASE_LOADING_MODEL: &str = "loading_model";
pub const PHASE_TRANSCRIBING: &str = "transcribing";

/// The JSON header the phone sends before the audio body.
#[derive(Debug, Clone, Deserialize)]
pub struct HandoffHeader {
    /// 32 hex chars, must match the desktop's persisted pairing token.
    pub token: String,
    /// Which operation this stream is. Absent or `"transcribe"` means a
    /// transcription request with an audio body; `"capabilities"` means a
    /// question with no body. Kept as a raw string so an unknown value is
    /// rejected as `invalid_request` rather than as a malformed header.
    #[serde(default)]
    pub op: Option<String>,
    /// Original file name, used only to pick a temp-file extension.
    #[serde(default)]
    pub filename: Option<String>,
    /// Content type reported by the phone. Informational.
    #[allow(dead_code)]
    #[serde(default)]
    pub mime: Option<String>,
    /// Whisper language code, or `None` for auto-detect.
    #[serde(default)]
    pub lang: Option<String>,
    /// Translate the transcript to English. Passed straight through to Server; only
    /// meaningful when the loaded model reported `translation: true`, but that is
    /// the phone's call to make, not enforced here.
    #[serde(default)]
    pub translate: Option<bool>,
}

/// One newline-delimited JSON object sent back to the phone.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HandoffEvent {
    /// Header parsed and token accepted; the desktop is reading the audio body.
    Accepted,
    /// A phase change, so the phone can say "Loading model…" instead of showing a
    /// transcription stuck at 0% while a large model loads.
    ///
    /// NOT terminal, and deliberately additive: a client that does not know this
    /// variant must ignore it and keep reading. Only `done` and `error` end a
    /// stream — a client tracking "did I see a terminal event" must not set that
    /// flag here.
    Status { phase: String },
    /// Terminal answer to `op: "capabilities"`. The language list is whatever the
    /// currently loaded model supports — the phone must never hardcode one.
    #[serde(rename_all = "camelCase")]
    Capabilities {
        model_loaded: bool,
        model_name: Option<String>,
        languages: Vec<String>,
        language_detection: bool,
        translation: bool,
        /// So the phone can refuse an oversized recording before spending the
        /// user's cellular data pushing it through a relay.
        max_audio_bytes: u64,
    },
    /// Transcription progress, 0-100.
    Progress { progress: i32 },
    /// A transcript segment. `start`/`stop` are centiseconds, matching
    /// Vibe's `Segment` type.
    Segment {
        start: i64,
        stop: i64,
        text: String,
        speaker: Option<i32>,
    },
    /// Terminal success. `saved_path` is where the desktop kept the recording:
    /// the audio only ever existed on the phone until now, so it is saved like any
    /// other Vibe recording rather than thrown away.
    #[serde(rename_all = "camelCase")]
    Done {
        text: String,
        processing_time_sec: u64,
        saved_path: Option<String>,
    },
    /// Terminal failure. No `Done` follows it.
    Error { code: String, message: String },
}

impl HandoffEvent {
    /// A non-terminal phase change. See [`PHASE_LOADING_MODEL`] and
    /// [`PHASE_TRANSCRIBING`].
    pub fn status(phase: &str) -> Self {
        Self::Status {
            phase: phase.to_string(),
        }
    }

    /// Whether this event ends the stream. Only `done` and `error` do.
    ///
    /// Nothing on the desktop branches on this — the terminal set is pinned here
    /// (and in the tests) so that adding a variant forces a decision about it,
    /// rather than a client silently guessing which events end a stream.
    #[allow(dead_code)]
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Done { .. } | Self::Error { .. })
    }

    /// The honest answer whenever the desktop cannot confirm what is loaded: no
    /// model, no language list. The phone renders this as "load a model on your
    /// desktop first". This is a normal state, never an error.
    pub fn no_capabilities() -> Self {
        Self::Capabilities {
            model_loaded: false,
            model_name: None,
            languages: Vec::new(),
            language_detection: false,
            translation: false,
            max_audio_bytes: MAX_AUDIO_BYTES,
        }
    }

    /// Serialize as a single line, newline included.
    pub fn to_line(&self) -> String {
        match serde_json::to_string(self) {
            Ok(json) => format!("{json}\n"),
            Err(error) => {
                // Serializing these types cannot realistically fail, but the phone
                // must never be left waiting on a dropped connection.
                tracing::error!("failed to serialize handoff event: {:?}", error);
                "{\"type\":\"error\",\"code\":\"internal_error\",\"message\":\"failed to serialize event\"}\n".to_string()
            }
        }
    }
}

/// Everything the frontend needs to write a phone transcription into the
/// transcripts store, matching `SaveTranscriptInput` in `lib/transcripts-store.ts`.
///
/// A handoff transcription happens entirely in Rust, so the frontend's queue never
/// sees it and would otherwise have nothing to save — which is why a phone
/// transcript never reached Recents.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffCompletion {
    /// Display name for the Recents row. The store appends its own timestamp.
    pub name: String,
    /// `sourcePath`: where the recording itself was saved.
    pub saved_path: String,
    pub segments: Vec<crate::transcript::Segment>,
    /// The language actually used, or `None` for auto-detect.
    pub language: Option<String>,
    pub model_path: Option<String>,
}

/// Payload of the `handoff_activity` Tauri event emitted to the main window.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffActivity {
    pub state: &'static str,
    pub message: Option<String>,
    /// Where the phone's recording was saved. Set on the `done` state so the UI
    /// can offer "Show in Finder"; `None` otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_path: Option<String>,
    /// Set only on `done`: hand the frontend a complete transcript record so it
    /// can call `saveTranscript`. Whether it actually saves is the frontend's
    /// call — it owns the `transcription.saveTranscripts` preference.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<crate::transcript::Segment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
}

impl HandoffActivity {
    pub fn new(state: &'static str, message: Option<String>) -> Self {
        Self {
            state,
            message,
            saved_path: None,
            name: None,
            segments: None,
            language: None,
            model_path: None,
        }
    }

    pub fn done(completion: HandoffCompletion) -> Self {
        Self {
            state: "done",
            message: None,
            saved_path: Some(completion.saved_path),
            name: Some(completion.name),
            segments: Some(completion.segments),
            language: completion.language,
            model_path: completion.model_path,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_line_uses_camel_case_field_names() {
        let line = HandoffEvent::Capabilities {
            model_loaded: true,
            model_name: Some("ggml-large-v3-turbo.bin".to_string()),
            languages: vec!["en".to_string(), "he".to_string()],
            language_detection: true,
            translation: true,
            max_audio_bytes: MAX_AUDIO_BYTES,
        }
        .to_line();
        assert!(line.ends_with('\n'));
        let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["type"], "capabilities");
        assert_eq!(parsed["modelLoaded"], true);
        assert_eq!(parsed["modelName"], "ggml-large-v3-turbo.bin");
        assert_eq!(parsed["languageDetection"], true);
        assert_eq!(parsed["translation"], true);
        assert_eq!(parsed["languages"][1], "he");
        // The phone pre-checks recording size against this to avoid a wasted upload.
        assert_eq!(parsed["maxAudioBytes"], 536_870_912u64);
        assert_eq!(parsed["maxAudioBytes"], MAX_AUDIO_BYTES);
    }

    #[test]
    fn no_model_is_reported_as_empty_capabilities_not_an_error() {
        let parsed: serde_json::Value = serde_json::from_str(HandoffEvent::no_capabilities().to_line().trim()).unwrap();
        assert_eq!(parsed["type"], "capabilities");
        assert_eq!(parsed["modelLoaded"], false);
        assert!(parsed["modelName"].is_null());
        assert_eq!(parsed["languages"].as_array().unwrap().len(), 0);
        assert_eq!(parsed["languageDetection"], false);
        assert_eq!(parsed["translation"], false);
        // Still advertised with no model: the phone needs the cap regardless.
        assert_eq!(parsed["maxAudioBytes"], MAX_AUDIO_BYTES);
    }

    #[test]
    fn done_line_keeps_camel_case_processing_time() {
        let parsed: serde_json::Value = serde_json::from_str(
            HandoffEvent::Done {
                text: "hi".to_string(),
                processing_time_sec: 12,
                saved_path: Some("/Users/me/Documents/Vibe/phone-2026-08-22-14-30-05.m4a".to_string()),
            }
            .to_line()
            .trim(),
        )
        .unwrap();
        assert_eq!(parsed["type"], "done");
        assert_eq!(parsed["processingTimeSec"], 12);
        assert_eq!(parsed["savedPath"], "/Users/me/Documents/Vibe/phone-2026-08-22-14-30-05.m4a");
    }

    #[test]
    fn status_line_is_additive_and_never_terminal() {
        for phase in [PHASE_LOADING_MODEL, PHASE_TRANSCRIBING] {
            let event = HandoffEvent::status(phase);
            // A client tracking "did I see a terminal event" must not set that flag here.
            assert!(!event.is_terminal(), "{phase} must not end the stream");
            let parsed: serde_json::Value = serde_json::from_str(event.to_line().trim()).unwrap();
            assert_eq!(parsed["type"], "status");
            assert_eq!(parsed["phase"], phase);
        }
        assert_eq!(
            HandoffEvent::status(PHASE_LOADING_MODEL).to_line(),
            "{\"type\":\"status\",\"phase\":\"loading_model\"}\n"
        );
    }

    #[test]
    fn only_done_and_error_are_terminal() {
        assert!(HandoffEvent::Done {
            text: String::new(),
            processing_time_sec: 0,
            saved_path: None,
        }
        .is_terminal());
        assert!(HandoffEvent::Error {
            code: "no_model".to_string(),
            message: String::new(),
        }
        .is_terminal());
        // Everything else leaves the stream open.
        assert!(!HandoffEvent::Accepted.is_terminal());
        assert!(!HandoffEvent::Progress { progress: 42 }.is_terminal());
        assert!(!HandoffEvent::no_capabilities().is_terminal());
        assert!(!HandoffEvent::Segment {
            start: 0,
            stop: 1,
            text: String::new(),
            speaker: None,
        }
        .is_terminal());
    }

    #[test]
    fn transcribe_header_carries_lang_and_translate() {
        let header: HandoffHeader = serde_json::from_str(
            r#"{"token":"0123456789abcdef0123456789abcdef","filename":"recording.m4a","mime":"audio/mp4","lang":"he","translate":true}"#,
        )
        .unwrap();
        assert!(header.op.is_none());
        assert_eq!(header.lang.as_deref(), Some("he"));
        assert_eq!(header.translate, Some(true));
    }

    #[test]
    fn translate_defaults_to_absent_when_the_phone_omits_it() {
        let header: HandoffHeader = serde_json::from_str(r#"{"token":"0123456789abcdef0123456789abcdef"}"#).unwrap();
        assert!(header.translate.is_none());
    }

    #[test]
    fn done_activity_carries_a_full_transcript_record_for_recents() {
        let parsed: serde_json::Value = serde_json::to_value(HandoffActivity::done(HandoffCompletion {
            name: "Phone recording".to_string(),
            saved_path: "/Users/me/Documents/Vibe/phone-2026-08-22-14-30-05.m4a".to_string(),
            segments: vec![crate::transcript::Segment {
                start: 120,
                stop: 350,
                text: "hello there".to_string(),
                speaker: None,
            }],
            language: Some("he".to_string()),
            model_path: Some("/models/ggml-medium.bin".to_string()),
        }))
        .unwrap();
        assert_eq!(parsed["state"], "done");
        // Exactly the field names `saveTranscript` expects.
        assert_eq!(parsed["name"], "Phone recording");
        assert_eq!(parsed["savedPath"], "/Users/me/Documents/Vibe/phone-2026-08-22-14-30-05.m4a");
        assert_eq!(parsed["language"], "he");
        assert_eq!(parsed["modelPath"], "/models/ggml-medium.bin");
        assert_eq!(parsed["segments"][0]["start"], 120);
        assert_eq!(parsed["segments"][0]["stop"], 350);
        assert_eq!(parsed["segments"][0]["text"], "hello there");
    }

    #[test]
    fn non_done_activity_carries_no_transcript_fields() {
        let receiving: serde_json::Value = serde_json::to_value(HandoffActivity::new("receiving", None)).unwrap();
        assert_eq!(receiving["state"], "receiving");
        for absent in ["savedPath", "name", "segments", "language", "modelPath"] {
            assert!(receiving.get(absent).is_none(), "{absent} should be omitted");
        }
    }

    #[test]
    fn auto_detect_leaves_language_absent_rather_than_guessing() {
        let parsed: serde_json::Value = serde_json::to_value(HandoffActivity::done(HandoffCompletion {
            name: "Phone recording".to_string(),
            saved_path: "/tmp/x.m4a".to_string(),
            segments: Vec::new(),
            language: None,
            model_path: None,
        }))
        .unwrap();
        assert!(parsed.get("language").is_none());
        assert!(parsed.get("modelPath").is_none());
        assert_eq!(parsed["segments"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn capabilities_header_with_empty_filename_and_mime_is_accepted() {
        // Exactly what agent B's wasm client and the native test client emit.
        let raw = r#"{"op":"capabilities","token":"0123456789abcdef0123456789abcdef","filename":"","mime":"","lang":null}"#;
        let header: HandoffHeader = serde_json::from_str(raw).unwrap();
        assert_eq!(header.op.as_deref(), Some(OP_CAPABILITIES));
        assert_eq!(header.filename.as_deref(), Some(""));
        assert_eq!(header.mime.as_deref(), Some(""));
        assert!(header.lang.is_none());
    }

    #[test]
    fn header_tolerates_missing_optional_fields() {
        let header: HandoffHeader = serde_json::from_str(r#"{"token":"0123456789abcdef0123456789abcdef"}"#).unwrap();
        assert!(header.op.is_none());
        assert!(header.filename.is_none());
        assert!(header.mime.is_none());
    }
}
