use super::{decode_event_reader, SonaEvent};
use bytes::Bytes;
use futures_util::{stream, StreamExt};
use tokio_util::io::StreamReader;

const EVENTS: &str = concat!(
    "{\"type\":\"progress\",\"progress\":25}\n",
    "{\"type\":\"segment\",\"start\":0.0,\"end\":1.5,\"text\":\"hello\",\"speaker\":null}\n",
    "{\"type\":\"result\",\"text\":\"hello\"}\n",
);

#[tokio::test]
async fn decodes_events_across_arbitrary_chunk_boundaries() {
    for chunk_size in 1..EVENTS.len() {
        let chunks = EVENTS
            .as_bytes()
            .chunks(chunk_size)
            .map(|chunk| Ok::<_, std::io::Error>(Bytes::copy_from_slice(chunk)))
            .collect::<Vec<_>>();
        let events = decode_event_reader(StreamReader::new(stream::iter(chunks)))
            .collect::<Vec<_>>()
            .await;

        assert_eq!(events.len(), 3, "chunk size {chunk_size}");
        assert!(matches!(events[0], Ok(SonaEvent::Progress { progress: 25 })));
        assert!(matches!(events[1], Ok(SonaEvent::Segment { ref text, .. }) if text == "hello"));
        assert!(matches!(events[2], Ok(SonaEvent::Result { ref text }) if text == "hello"));
    }
}

#[tokio::test]
async fn reports_invalid_json_instead_of_dropping_it() {
    let chunks = stream::iter([Ok::<_, std::io::Error>(Bytes::from_static(b"not json\n"))]);
    let events = decode_event_reader(StreamReader::new(chunks)).collect::<Vec<_>>().await;

    assert_eq!(events.len(), 1);
    assert!(events[0].is_err());
}

#[tokio::test]
async fn accepts_result_lines_larger_than_the_default_codec_limit() {
    let text = "a".repeat(16 * 1024);
    let line = format!("{{\"type\":\"result\",\"text\":\"{text}\"}}\n");
    let chunks = stream::iter([Ok::<_, std::io::Error>(Bytes::from(line))]);
    let events = decode_event_reader(StreamReader::new(chunks)).collect::<Vec<_>>().await;

    assert!(matches!(events.as_slice(), [Ok(SonaEvent::Result { text: result })] if result == &text));
}
