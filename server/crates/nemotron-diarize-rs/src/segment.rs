//! Per-frame speaker probabilities to speech segments (`extract_speaker_dict`).

/// One speaker's contiguous speech. Overlapping speech gives overlapping segments.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Segment {
    /// Seconds.
    pub start: f64,
    /// Seconds.
    pub end: f64,
    /// Speakers are numbered in order of first arrival.
    pub speaker_id: usize,
}

/// Thresholds `probs` (`[frames, speakers]`) per speaker; frames from `num_valid` on are padding.
pub(crate) fn extract(probs: &[f32], speakers: usize, num_valid: usize, frame_seconds: f64, threshold: f32) -> Vec<Segment> {
    let frames = (probs.len() / speakers).min(num_valid);
    let mut segments = Vec::new();
    for speaker in 0..speakers {
        let mut start = None;
        for frame in 0..=frames {
            let active = frame < frames && probs[frame * speakers + speaker] > threshold;
            match (active, start) {
                (true, None) => start = Some(frame),
                (false, Some(begin)) => {
                    segments.push(Segment {
                        start: begin as f64 * frame_seconds,
                        end: frame as f64 * frame_seconds,
                        speaker_id: speaker,
                    });
                    start = None;
                }
                _ => {}
            }
        }
    }
    segments.sort_by(|a, b| a.start.total_cmp(&b.start).then(a.speaker_id.cmp(&b.speaker_id)));
    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_runs_per_speaker() {
        // 2 speakers, 5 frames.
        let probs = [0.9, 0.1, 0.9, 0.1, 0.1, 0.8, 0.1, 0.8, 0.9, 0.9];
        let segments = extract(&probs, 2, 5, 0.01, 0.5);
        let spans = segments
            .iter()
            .map(|s| (s.speaker_id, (s.start * 100.0).round(), (s.end * 100.0).round()))
            .collect::<Vec<_>>();
        assert_eq!(spans, [(0, 0.0, 2.0), (1, 2.0, 5.0), (0, 4.0, 5.0)]);
    }

    #[test]
    fn padding_frames_are_ignored() {
        let probs = [0.9, 0.9, 0.9];
        let segments = extract(&probs, 1, 2, 0.01, 0.5);
        assert_eq!(segments.len(), 1);
        assert!((segments[0].end - 0.02).abs() < 1e-9);
    }
}
