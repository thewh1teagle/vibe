//! What may leave the machine in an analytics event.
//!
//! Two gates. Events from the webview pass an allowlist: known event names, known prop keys,
//! short values from a fixed character set, everything else dropped without a word. Every
//! `error_message`, from the webview or built in Rust, can quote a path from an OS or server
//! error, so it is scrubbed of anything path-like before it is queued.

use serde_json::{Map, Value};

/// Replaces every path, home directory, file name or user name found in a message.
pub const PATH_PLACEHOLDER: &str = "<path>";

/// Longest string a webview prop may carry: enough for an error code, nothing for prose.
const MAX_WEBVIEW_STRING: usize = 40;
/// Largest raw `error_message` accepted from the webview, before scrubbing and the 180-char cap.
const MAX_WEBVIEW_MESSAGE_BYTES: usize = 16 * 1024;
/// Largest number a webview prop may carry (seconds, segment counts): about 115 days.
const MAX_WEBVIEW_NUMBER: f64 = 10_000_000.0;

const SOURCES: &[&str] = &["home", "batch", "main", "hotkey"];
const ERROR_KINDS: &[&str] = &["user", "internal"];
const OOM_SIGNALS: &[&str] = &["error_code", "process_death"];

enum Rule {
    /// One of a fixed set of values.
    OneOf(&'static [&'static str]),
    /// A short token of `[A-Za-z0-9_-]`, such as an error code or a file extension.
    Token,
    /// A finite, non-negative number below `MAX_WEBVIEW_NUMBER`.
    Count,
    /// Free text, kept so failures can be debugged. Scrubbed of paths and capped like every
    /// `error_message` before it is queued (`track_event_handle_with_props`); only the raw size is
    /// bounded here.
    Message,
}

/// Every event the webview sends (`desktop/src/lib/analytics.ts`) and the props each may carry.
const WEBVIEW_EVENTS: &[(&str, &[(&str, Rule)])] = &[
    (
        "transcribe_started",
        &[
            ("source", Rule::OneOf(SOURCES)),
            ("file_ext", Rule::Token),
            ("audio_duration_seconds", Rule::Count),
        ],
    ),
    (
        "transcribe_succeeded",
        &[
            ("source", Rule::OneOf(SOURCES)),
            ("duration_seconds", Rule::Count),
            ("segments_count", Rule::Count),
        ],
    ),
    (
        "transcribe_failed",
        &[
            ("source", Rule::OneOf(SOURCES)),
            ("error_code", Rule::Token),
            ("error_message", Rule::Message),
            ("file_ext", Rule::Token),
            ("error_kind", Rule::OneOf(ERROR_KINDS)),
        ],
    ),
    (
        "transcribe_cancelled",
        &[("source", Rule::OneOf(SOURCES)), ("file_ext", Rule::Token)],
    ),
    (
        "gpu_out_of_memory",
        &[("source", Rule::OneOf(SOURCES)), ("signal", Rule::OneOf(OOM_SIGNALS))],
    ),
];

impl Rule {
    fn accepts(&self, value: &Value) -> bool {
        match (self, value) {
            (Rule::OneOf(allowed), Value::String(s)) => allowed.contains(&s.as_str()),
            (Rule::Token, Value::String(s)) => {
                !s.is_empty()
                    && s.len() <= MAX_WEBVIEW_STRING
                    && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            }
            (Rule::Count, Value::Number(n)) => n
                .as_f64()
                .is_some_and(|n| n.is_finite() && (0.0..MAX_WEBVIEW_NUMBER).contains(&n)),
            (Rule::Message, Value::String(s)) => s.len() <= MAX_WEBVIEW_MESSAGE_BYTES,
            _ => false,
        }
    }
}

/// The event as the webview may send it, or `None` when the name is not one it sends.
/// Unknown keys and values that fail their rule are dropped; the event itself still goes.
pub fn webview_event(name: &str, props: Option<Value>) -> Option<(&'static str, Value)> {
    let (name, rules) = WEBVIEW_EVENTS.iter().find(|(known, _)| *known == name)?;
    let mut kept = Map::new();
    if let Some(Value::Object(props)) = props {
        for (key, value) in props {
            if let Some((key, _)) = rules.iter().find(|(k, rule)| *k == key && rule.accepts(&value)) {
                kept.insert((*key).to_string(), value);
            }
        }
    }
    Some((name, Value::Object(kept)))
}

/// Who is running this, so their home directory and user name can be blanked out of messages.
pub struct Identity {
    homes: Vec<String>,
    users: Vec<String>,
}

impl Identity {
    pub fn current() -> Self {
        let home = ["HOME", "USERPROFILE"].iter().filter_map(|k| std::env::var(k).ok()).collect();
        let users = ["USER", "USERNAME", "LOGNAME"]
            .iter()
            .filter_map(|k| std::env::var(k).ok())
            .collect();
        Self::new(home, users)
    }

    fn new(homes: Vec<String>, mut users: Vec<String>) -> Self {
        let mut all_homes = Vec::new();
        for home in homes {
            let home = home.trim_end_matches(['/', '\\']).to_string();
            // Too short to be a home ("/" or "C:"), and replacing it would shred the message.
            if home.len() < 4 {
                continue;
            }
            if let Some(last) = home.rsplit(['/', '\\']).next() {
                users.push(last.to_string());
            }
            all_homes.push(home.replace('\\', "/"));
            all_homes.push(home.replace('/', "\\"));
            all_homes.push(home);
        }
        users.retain(|u| u.chars().count() >= 3);
        users.sort();
        users.dedup();
        Self { homes: all_homes, users }
    }
}

/// Characters that end a path in running text. A colon ends one only before whitespace (`C:\` keeps it).
fn is_terminator(chars: &[char], i: usize) -> bool {
    let c = chars[i];
    matches!(
        c,
        '"' | '\'' | '`' | '<' | '>' | '|' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';' | '\n' | '\r' | '\t'
    ) || (c == ':' && chars.get(i + 1).is_none_or(|n| n.is_whitespace()))
}

/// Characters after which a `/` or `\` starts a path rather than sitting inside a word like `I/O`.
fn starts_after(c: char) -> bool {
    c.is_whitespace() || matches!(c, '"' | '\'' | '`' | '(' | '[' | '{' | '=' | ':' | ',' | ';' | '>' | ')')
}

fn is_separator(c: char) -> bool {
    c == '/' || c == '\\'
}

/// Extensions that make a bare word a file name (`song.mp3`, `ggml-small.bin`).
const FILE_EXTENSIONS: &[&str] = &[
    "mp4",
    "mkv",
    "avi",
    "mov",
    "wmv",
    "webm",
    "mxf",
    "mp3",
    "wav",
    "aac",
    "flac",
    "oga",
    "ogg",
    "opus",
    "m4a",
    "m4b",
    "wma",
    "aiff",
    "amr",
    "3gp",
    "bin",
    "gguf",
    "ggml",
    "onnx",
    "safetensors",
    "pt",
    "txt",
    "json",
    "srt",
    "vtt",
    "pdf",
    "docx",
    "doc",
    "md",
    "csv",
    "log",
    "toml",
    "yaml",
    "yml",
    "zip",
    "exe",
    "dll",
    "so",
    "dylib",
    "app",
    "dmg",
    "tmp",
];

/// A word ending in `.ext` with a short alphanumeric extension; with `known_only`, one on the list.
fn has_extension(word: &str, known_only: bool) -> bool {
    let word = word.trim_end_matches(['.', ',', ':', ';', '!', '?']);
    let Some((stem, ext)) = word.rsplit_once('.') else {
        return false;
    };
    if stem.is_empty() || ext.is_empty() || ext.len() > 11 || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return false;
    }
    !known_only || FILE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str())
}

/// Length of the path starting at `i`, or `None` when no path starts there.
fn path_at(chars: &[char], i: usize) -> Option<usize> {
    let n = chars.len();
    if i > 0 && !starts_after(chars[i - 1]) {
        return None;
    }
    let c = chars[i];
    let next = chars.get(i + 1).copied();
    let starts = (is_separator(c) && next.is_some_and(|n| !n.is_whitespace()))
        || (c == '~' && next.is_some_and(is_separator))
        || (c.is_ascii_alphabetic() && next == Some(':') && chars.get(i + 2).copied().is_some_and(is_separator));
    if !starts {
        return None;
    }
    let mut end = i;
    while end < n && !is_terminator(chars, end) {
        end += 1;
    }
    // Spaces are legal in a path, so the span runs to a hard terminator (a quote, a bracket, a
    // comma, `: `, the end of the line). The path ends at the first word after its last separator
    // that carries a file extension (`/Users/me/My Music/song name.wav (os error 2)`); without
    // one, the whole span goes, erring on the side of removing too much.
    let last_separator = (i..end).rev().find(|&k| is_separator(chars[k]))?;
    let tail: String = chars[last_separator + 1..end].iter().collect();
    let mut path_end = end;
    let mut offset = 0;
    for word in tail.split(' ').take(5) {
        let word_end = offset + word.chars().count();
        if has_extension(word, false) {
            path_end = last_separator + 1 + word_end;
            break;
        }
        offset = word_end + 1;
    }
    // Sentence punctuation after the path stays in the message.
    while path_end > i + 1 && matches!(chars[path_end - 1], '.' | ',' | ':' | ';' | '!' | '?' | ' ') {
        path_end -= 1;
    }
    (path_end > i + 1 && chars[i..path_end].iter().any(|c| c.is_alphanumeric())).then_some(path_end - i)
}

fn replace_paths(message: &str) -> String {
    let chars: Vec<char> = message.chars().collect();
    let mut out = String::with_capacity(message.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(len) = path_at(&chars, i) {
            out.push_str(PATH_PLACEHOLDER);
            i += len;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Words that end the walk back from a bare file name: what precedes a name in an error message.
const NAME_STOPS: &[&str] = &[
    "file", "for", "from", "at", "in", "to", "of", "open", "opening", "read", "reading", "load", "loading", "decode", "decoding",
    "save", "saving", "write", "writing", "model", "audio", "path", "named", "called", "with", "and", "the",
];

/// Most words a bare file name is assumed to span when it has spaces (`my private notes.bin`).
const MAX_NAME_WORDS: usize = 5;

/// Words the path scan cannot see: a bare `song.mp3` (with the words before it that may belong to
/// the name), a relative `models/ggml-small`, a user name.
fn replace_words(message: &str, users: &[String]) -> String {
    // Alternating runs: words, and the gaps (whitespace or terminators) between them.
    let chars: Vec<char> = message.chars().collect();
    let mut runs: Vec<(String, bool)> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let is_gap = |k: usize| chars[k].is_whitespace() || is_terminator(&chars, k);
        let gap = is_gap(i);
        let start = i;
        while i < chars.len() && is_gap(i) == gap {
            i += 1;
        }
        runs.push((chars[start..i].iter().collect(), !gap));
    }
    let core = |word: &str| word.trim_end_matches(['.', ',', ':', ';', '!', '?']).len();
    let mut hidden = vec![false; runs.len()];
    for index in 0..runs.len() {
        let (word, is_word) = &runs[index];
        if !is_word || word.contains(PATH_PLACEHOLDER) {
            continue;
        }
        let word = &word[..core(word)];
        let separators = word.chars().filter(|&c| is_separator(c)).count();
        let path_like = separators > 0 && (has_extension(word, false) || separators >= 2 || word.contains('\\'));
        let file_name = has_extension(word, true);
        if !path_like && !file_name {
            continue;
        }
        hidden[index] = true;
        if !file_name {
            continue;
        }
        // A name with spaces: take the words before it, back to a word that introduces names.
        let mut back = index;
        for _ in 1..MAX_NAME_WORDS {
            if back < 2 || runs[back - 1].0.chars().any(|c| c != ' ') {
                break;
            }
            let (previous, _) = &runs[back - 2];
            let trimmed = &previous[..core(previous)];
            if trimmed.len() != previous.len()
                || previous.contains(PATH_PLACEHOLDER)
                || NAME_STOPS.contains(&previous.to_lowercase().as_str())
            {
                break;
            }
            back -= 2;
            hidden[back] = true;
            hidden[back + 1] = true;
        }
    }
    let mut out = String::with_capacity(message.len());
    for (index, (run, _)) in runs.iter().enumerate() {
        if !hidden[index] {
            out.push_str(run);
        } else if index + 1 == runs.len() || !hidden[index + 1] {
            // The last run of a hidden stretch: one placeholder, then any trailing punctuation.
            out.push_str(PATH_PLACEHOLDER);
            out.push_str(&run[core(run)..]);
        }
    }
    for user in users {
        out = replace_whole_word(&out, user);
    }
    out
}

/// Case-insensitive replacement of `needle` wherever it is not part of a longer alphanumeric word.
fn replace_whole_word(haystack: &str, needle: &str) -> String {
    let lower_hay = haystack.to_lowercase();
    let lower_needle = needle.to_lowercase();
    // Lowercasing can change byte lengths outside ASCII; then fall back to an exact match.
    let (search, target) = if lower_hay.len() == haystack.len() && lower_needle.len() == needle.len() {
        (lower_hay.as_str(), lower_needle.as_str())
    } else {
        (haystack, needle)
    };
    let mut out = String::new();
    let mut last = 0;
    for (at, _) in search.match_indices(target) {
        if at < last {
            continue;
        }
        let before = haystack[..at].chars().next_back();
        let after = haystack[at + target.len()..].chars().next();
        if before.is_some_and(char::is_alphanumeric) || after.is_some_and(char::is_alphanumeric) {
            continue;
        }
        out.push_str(&haystack[last..at]);
        out.push_str(PATH_PLACEHOLDER);
        last = at + target.len();
    }
    out.push_str(&haystack[last..]);
    out
}

/// `message` with every path-like substring replaced by `<path>`.
pub fn scrub_message(message: &str, identity: &Identity) -> String {
    let mut text = message.to_string();
    for home in &identity.homes {
        text = text.replace(home.as_str(), PATH_PLACEHOLDER);
    }
    let text = replace_words(&replace_paths(&text), &identity.users);
    let doubled = format!("{PATH_PLACEHOLDER}{PATH_PLACEHOLDER}");
    let mut text = text;
    while text.contains(&doubled) {
        text = text.replace(&doubled, PATH_PLACEHOLDER);
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn identity() -> Identity {
        Identity::new(
            vec!["/Users/john.doe".into(), "C:\\Users\\jdoe".into()],
            vec!["john.doe".into(), "jdoe".into()],
        )
    }

    /// Messages shaped like the real ones: OS errors, server stderr, model loads.
    const PATH_BEARING: &[&str] = &[
        "Audio file not found: /Users/john.doe/Music/interview final.wav",
        "Audio file not found: /Users/a b/my recording.m4a",
        "Audio file not found: /Users/a b/my recording",
        "failed to load model /home/alice/.local/share/vibe/ggml-large-v3.bin: invalid magic",
        "Audio file not found: C:\\Users\\jdoe\\My Documents\\call 17.8.2026.MOV",
        "Audio file not found: C:\\Users\\a b\\call 1.wav",
        "cannot open \\\\fileserver\\share\\team\\meeting notes.m4a (os error 53)",
        "No such file '/Volumes/External Drive/Recordings/board meeting.mp3', giving up",
        "vibe-server stderr: error: decoding failed for secret-diagnosis.mp3.",
        "failed to read model file my private notes.bin",
        "failed to spawn server: No such file or directory (os error 2) at /Applications/Vibe.app/Contents/MacOS/vibe-server",
        "Permission denied: ~/Library/Application Support/github.com.thewh1teagle.vibe/models",
        "model at relative/models/ggml-small failed, user john.doe",
        "C:/Users/jdoe/AppData/Local/vibe/model.bin was truncated",
        "file:///home/alice/rec.wav did not decode",
    ];

    fn assert_nothing_path_like(text: &str, original: &str) {
        for leak in [
            "/",
            "\\",
            "john",
            "jdoe",
            "alice",
            "Users",
            "home",
            "Music",
            "Documents",
            "fileserver",
            "Recordings",
            "interview",
            "secret",
            "board",
            "private",
            "notes",
            "recording",
            "a b",
            "call",
            ".wav",
            ".mp3",
            ".MOV",
            ".m4a",
            ".bin",
            "Volumes",
            "Library",
            "models",
            "Vibe.app",
        ] {
            assert!(!text.contains(leak), "{original:?} -> {text:?} leaked {leak:?}");
        }
    }

    #[test]
    fn error_messages_never_leak_a_path_or_a_personal_filename() {
        let identity = identity();
        for message in PATH_BEARING {
            let scrubbed = scrub_message(message, &identity);
            assert!(scrubbed.contains(PATH_PLACEHOLDER), "{message:?} -> {scrubbed:?}");
            assert_nothing_path_like(&scrubbed, message);
        }
    }

    #[test]
    fn scrubbing_keeps_the_part_of_the_message_worth_having() {
        let identity = identity();
        let cases = [
            (
                "Audio file not found: /Users/john.doe/a b/c.wav (os error 2)",
                "Audio file not found: <path> (os error 2)",
            ),
            (
                "Audio file not found: /Users/a b/my recording.m4a",
                "Audio file not found: <path>",
            ),
            ("decoding failed for song.mp3.", "decoding failed for <path>."),
            (
                "failed to read model file my private notes.bin",
                "failed to read model file <path>",
            ),
            ("C:\\Users\\a b\\call 1.wav: access denied", "<path>: access denied"),
        ];
        for (message, expected) in cases {
            assert_eq!(scrub_message(message, &identity), expected, "{message:?}");
        }
        let plain = "failed to spawn server: I/O error, exit code 3.3, see e.g. the log";
        assert_eq!(scrub_message(plain, &identity), plain);
    }

    #[test]
    fn webview_events_carry_only_known_short_tokens_and_a_scrubbed_message() {
        let identity = identity();
        for message in PATH_BEARING {
            let (_, props) = webview_event(
                "transcribe_failed",
                Some(json!({
                    "source": "main",
                    "error_code": message,
                    "error_message": message,
                    "file_ext": message,
                    "error_kind": "internal",
                    "install_id": "spoofed",
                    "path": message,
                })),
            )
            .unwrap();
            // What `track_event_handle_with_props` does to every message before queueing.
            let mut props = props.as_object().unwrap().clone();
            let scrubbed = scrub_message(props["error_message"].as_str().unwrap(), &identity);
            props.insert("error_message".into(), scrubbed.clone().into());
            assert_eq!(
                Value::Object(props.clone()),
                json!({ "source": "main", "error_kind": "internal", "error_message": scrubbed }),
                "{message:?}"
            );
            assert_nothing_path_like(&Value::Object(props).to_string(), message);
        }
        let (_, props) = webview_event(
            "transcribe_started",
            Some(json!({ "source": "hotkey", "file_ext": "wav", "audio_duration_seconds": 61, "path": "/x" })),
        )
        .unwrap();
        assert_eq!(
            props,
            json!({ "source": "hotkey", "file_ext": "wav", "audio_duration_seconds": 61 })
        );
        let (_, props) = webview_event(
            "transcribe_failed",
            Some(json!({ "source": "evil", "error_code": "invalid_audio", "file_ext": "doe/rec", "error_kind": 1, "error_message": 5 })),
        )
        .unwrap();
        assert_eq!(props, json!({ "error_code": "invalid_audio" }));
        let (_, props) = webview_event(
            "transcribe_succeeded",
            Some(json!({ "duration_seconds": -1, "segments_count": "3" })),
        )
        .unwrap();
        assert_eq!(props, json!({}));
        // Only the failure event carries a message.
        let (_, props) = webview_event("transcribe_cancelled", Some(json!({ "error_message": "x" }))).unwrap();
        assert_eq!(props, json!({}));
    }

    #[test]
    fn webview_cannot_send_other_events() {
        for name in ["app_started", "cli_spawn_failed", "handoff_enabled", "anything", ""] {
            assert!(webview_event(name, Some(json!({ "source": "main" }))).is_none(), "{name}");
        }
    }
}
