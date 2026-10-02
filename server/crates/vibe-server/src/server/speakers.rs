//! Attributes transcript segments to diarization speaker turns.
//!
//! A recognizer segment can run across several speakers (Nemotron and Parakeet
//! split on sentence punctuation, which an unpunctuated stretch lacks), so a
//! segment with word timings is split wherever the speaker changes. Without
//! word timings the whole segment takes the speaker it overlaps most.

use whisper_rs::Segment;

use crate::server::diarization;

/// How far (seconds) a stretch of speech may sit from the nearest speaker turn and
/// still be attributed to it. Diarization drops short, quiet utterances ("you know,")
/// that the recognizer kept, and a line with no speaker cannot be exported, renamed
/// or filtered like the others.
const NEAREST_TURN_TOLERANCE_SECS: f64 = 1.5;

/// A run of one speaker within a segment. Times are centiseconds, like [`Segment`]'s.
#[derive(Debug, Clone, PartialEq)]
pub struct Turn {
    pub start: i64,
    pub end: i64,
    pub text: String,
    pub speaker: Option<usize>,
    pub no_speech_prob: f32,
}

/// Splits `segment` into one [`Turn`] per run of the same speaker. A segment
/// without word timings, or a request without diarization, stays whole.
pub fn attribute(segment: &Segment, turns: &[diarization::Segment]) -> Vec<Turn> {
    let whole = |speaker| Turn {
        start: segment.start,
        end: segment.end,
        text: segment.text.clone(),
        speaker,
        no_speech_prob: segment.no_speech_prob,
    };
    if turns.is_empty() {
        return vec![whole(None)];
    }
    if segment.words.is_empty() {
        return vec![whole(match_speaker(cs(segment.start), cs(segment.end), turns))];
    }

    // A word nobody claims (a gap in the diarization) between two attributed words
    // continues the run before it. At either end of the segment it stays unassigned,
    // as a whole segment that far from every turn does.
    let mut speakers = segment
        .words
        .iter()
        .map(|word| match_speaker(cs(word.start), cs(word.end), turns))
        .collect::<Vec<_>>();
    let first_known = speakers.iter().position(Option::is_some);
    let last_known = speakers.iter().rposition(Option::is_some);
    if let (Some(first), Some(last)) = (first_known, last_known) {
        for index in first + 1..last {
            if speakers[index].is_none() {
                speakers[index] = speakers[index - 1];
            }
        }
    }

    let mut runs: Vec<Turn> = Vec::new();
    for (word, speaker) in segment.words.iter().zip(speakers) {
        match runs.last_mut() {
            Some(run) if run.speaker == speaker => {
                run.end = word.end;
                run.text.push_str(&word.text);
            }
            _ => runs.push(Turn {
                start: word.start,
                end: word.end,
                text: word.text.clone(),
                speaker,
                no_speech_prob: segment.no_speech_prob,
            }),
        }
    }
    // The segment's own bounds frame the speech; word timings sit inside them.
    if let Some(first) = runs.first_mut() {
        first.start = segment.start.min(first.start);
    }
    if let Some(last) = runs.last_mut() {
        last.end = segment.end.max(last.end);
    }
    for run in &mut runs {
        run.text = run.text.trim().to_owned();
    }
    runs.retain(|run| !run.text.is_empty());
    if runs.is_empty() {
        return vec![whole(match_speaker(cs(segment.start), cs(segment.end), turns))];
    }
    runs
}

/// The speaker whose turn overlaps `[start, end]` (seconds) most, else the nearest
/// turn within [`NEAREST_TURN_TOLERANCE_SECS`].
pub fn match_speaker(start: f64, end: f64, turns: &[diarization::Segment]) -> Option<usize> {
    let mut best_id = None;
    let mut best_overlap = 0.0;
    let mut nearest = None;
    let mut nearest_gap = f64::INFINITY;
    for turn in turns {
        let overlap = turn.end.min(end) - turn.start.max(start);
        if overlap > best_overlap {
            best_overlap = overlap;
            best_id = Some(turn.speaker_id);
        }
        let gap = (turn.start - end).max(start - turn.end);
        if gap < nearest_gap {
            nearest_gap = gap;
            nearest = Some(turn.speaker_id);
        }
    }
    if best_id.is_some() {
        return best_id;
    }
    (nearest_gap <= NEAREST_TURN_TOLERANCE_SECS).then_some(nearest).flatten()
}

fn cs(centiseconds: i64) -> f64 {
    centiseconds as f64 / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use whisper_rs::Word;

    fn turn(start: f64, end: f64, speaker_id: usize) -> diarization::Segment {
        diarization::Segment { start, end, speaker_id }
    }

    fn word(start: i64, end: i64, text: &str) -> Word {
        Word {
            start,
            end,
            text: text.into(),
        }
    }

    fn segment(words: Vec<Word>) -> Segment {
        Segment {
            start: words.first().map_or(0, |w| w.start),
            end: words.last().map_or(0, |w| w.end),
            text: words.iter().map(|w| w.text.as_str()).collect::<String>().trim().to_owned(),
            no_speech_prob: 0.0,
            words,
        }
    }

    fn spans(turns: &[Turn]) -> Vec<(Option<usize>, i64, i64, &str)> {
        turns.iter().map(|t| (t.speaker, t.start, t.end, t.text.as_str())).collect()
    }

    #[test]
    fn overlap_wins_over_proximity() {
        let turns = [turn(0.0, 10.0, 0), turn(10.0, 20.0, 1)];
        assert_eq!(match_speaker(9.0, 12.5, &turns), Some(1));
        assert_eq!(match_speaker(2.0, 4.0, &turns), Some(0));
    }

    #[test]
    fn a_line_in_a_gap_takes_the_nearest_turn() {
        let turns = [turn(0.0, 10.0, 0), turn(12.0, 20.0, 1)];
        assert_eq!(match_speaker(10.2, 10.8, &turns), Some(0));
        assert_eq!(match_speaker(11.4, 11.9, &turns), Some(1));
    }

    #[test]
    fn a_line_far_from_any_turn_stays_unassigned() {
        let turns = [turn(0.0, 10.0, 0)];
        assert_eq!(match_speaker(12.0, 13.0, &turns), None);
        assert_eq!(match_speaker(1.0, 2.0, &[]), None);
    }

    #[test]
    fn splits_a_segment_where_the_speaker_changes() {
        let turns = [turn(0.0, 2.0, 0), turn(2.5, 5.0, 1), turn(5.5, 8.0, 0)];
        let segment = segment(vec![
            word(10, 60, " held"),
            word(70, 150, " home."),
            word(260, 330, " Mr."),
            word(340, 480, " Cameron"),
            word(560, 700, " internet"),
        ]);
        let result = attribute(&segment, &turns);
        assert_eq!(
            spans(&result),
            [
                (Some(0), 10, 150, "held home."),
                (Some(1), 260, 480, "Mr. Cameron"),
                (Some(0), 560, 700, "internet"),
            ]
        );
    }

    #[test]
    fn a_word_in_a_diarization_gap_joins_the_run_before_it() {
        // "um" sits 3 s from any turn, beyond the nearest-turn tolerance.
        let turns = [turn(0.0, 1.0, 0), turn(8.0, 9.0, 1)];
        let segment = segment(vec![word(10, 90, " so"), word(450, 470, " um"), word(810, 890, " yes")]);
        let result = attribute(&segment, &turns);
        assert_eq!(spans(&result), [(Some(0), 10, 470, "so um"), (Some(1), 810, 890, "yes")]);
    }

    #[test]
    fn trailing_words_far_from_every_turn_stay_unassigned() {
        let turns = [turn(0.0, 1.0, 0)];
        let segment = segment(vec![word(10, 90, " yes"), word(500, 560, " these"), word(560, 620, " academics")]);
        let result = attribute(&segment, &turns);
        assert_eq!(spans(&result), [(Some(0), 10, 90, "yes"), (None, 500, 620, "these academics")]);
    }

    #[test]
    fn without_words_the_segment_takes_its_best_overlap() {
        let turns = [turn(0.0, 1.0, 0), turn(1.0, 9.0, 1)];
        let mut segment = segment(vec![word(0, 900, " whole")]);
        segment.words.clear();
        assert_eq!(spans(&attribute(&segment, &turns)), [(Some(1), 0, 900, "whole")]);
    }

    #[test]
    fn without_diarization_the_segment_stays_whole() {
        let segment = segment(vec![word(0, 50, " a"), word(60, 90, " b")]);
        assert_eq!(spans(&attribute(&segment, &[])), [(None, 0, 90, "a b")]);
    }
}
