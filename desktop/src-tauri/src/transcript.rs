use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transcript {
    pub processing_time_sec: u64,
    pub segments: Vec<Segment>,
}

/// Times are centiseconds.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Segment {
    pub start: i64,
    pub stop: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<i32>,
    /// The segment's words with their own times, which the frontend regroups
    /// into sentences and paragraphs. Absent from a server that predates them.
    #[serde(default, skip_serializing_if = "no_words")]
    pub words: Option<Vec<Word>>,
}

/// One word of a [`Segment`], in centiseconds like it. The text keeps its
/// leading space, so joining a segment's words rebuilds its text.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Word {
    pub start: i64,
    pub stop: i64,
    pub text: String,
}

fn no_words(words: &Option<Vec<Word>>) -> bool {
    words.as_ref().is_none_or(Vec::is_empty)
}

/// The server reports seconds; a transcript keeps centiseconds. Rounded, since
/// the server's seconds are centiseconds over 100 and 0.29 * 100.0 is 28.99…
pub fn centiseconds(seconds: f64) -> i64 {
    (seconds * 100.0).round() as i64
}

impl Segment {
    /// A segment as the server streamed it.
    pub fn from_server(
        start: f64,
        end: f64,
        text: String,
        speaker: Option<i32>,
        words: Option<Vec<crate::server::ServerWord>>,
    ) -> Self {
        Self {
            start: centiseconds(start),
            stop: centiseconds(end),
            text,
            speaker,
            words: words.filter(|words| !words.is_empty()).map(|words| {
                words
                    .into_iter()
                    .map(|word| Word {
                        start: centiseconds(word.start),
                        stop: centiseconds(word.end),
                        text: word.text,
                    })
                    .collect()
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::ServerWord;

    #[test]
    fn a_server_segment_becomes_centiseconds_with_its_words() {
        let segment = Segment::from_server(
            0.29,
            2.5,
            "Hello world.".into(),
            Some(1),
            Some(vec![
                ServerWord {
                    start: 0.29,
                    end: 1.7,
                    text: " Hello".into(),
                },
                ServerWord {
                    start: 1.8,
                    end: 2.5,
                    text: " world.".into(),
                },
            ]),
        );
        assert_eq!(
            serde_json::to_value(&segment).unwrap(),
            serde_json::json!({
                "start": 29,
                "stop": 250,
                "text": "Hello world.",
                "speaker": 1,
                "words": [
                    { "start": 29, "stop": 170, "text": " Hello" },
                    { "start": 180, "stop": 250, "text": " world." },
                ],
            })
        );
    }

    #[test]
    fn a_segment_without_words_serializes_no_words_field() {
        for words in [None, Some(Vec::new())] {
            let segment = Segment::from_server(0.0, 1.5, "hello".into(), None, words);
            assert_eq!(
                serde_json::to_value(&segment).unwrap(),
                serde_json::json!({ "start": 0, "stop": 150, "text": "hello" })
            );
        }
    }

    #[test]
    fn a_stored_segment_without_words_still_parses() {
        let segment: Segment = serde_json::from_str(r#"{"start":0,"stop":150,"text":"hello"}"#).unwrap();
        assert!(segment.words.is_none());
    }
}
