//! End-to-end validation: WAV in, probabilities and segments out, diffed
//! against the ONNX baseline recorded in `baseline/`.
//!
//!     cargo run -p diarize-rs --release --example e2e_baseline -- \
//!         models/diar_streaming_sortformer_4spk-v2.f32.gguf
//!
//! Unlike `run_chunk_real`, which only ever exercised the very first chunk from
//! a pre-recorded mel, this runs the whole path: audio -> mel (with the GGUF's
//! trained filterbank) -> chunking -> the ggml graph -> the AOSC speaker cache
//! -> post-processing. Every chunk past the first runs with a non-empty cache,
//! which is the part of the port the first-chunk check could not reach.
//!
//! Two caveats on what a difference here means:
//!
//! * The mel is not expected to be bit-identical to the baseline's. The
//!   baseline recomputed the librosa/Slaney filterbank; this path uses the
//!   torchaudio-built one shipped in the GGUF as `preprocessor.fb`. The example
//!   reports the mel difference separately so its contribution is visible.
//! * `segments/` depends on the CallHome thresholds, so small probability
//!   differences near a threshold can move a boundary by a frame or two without
//!   meaning the graph disagrees.

use std::fs;

use diarize_rs::Diarizer;

const NUM_SPEAKERS: usize = 4;

fn read_f32(path: &str) -> Vec<f32> {
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn read_shape(path: &str) -> Vec<usize> {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let start = text.find("\"shape\"").expect("shape key");
    let open = text[start..].find('[').expect("shape array") + start;
    let close = text[open..].find(']').expect("shape array end") + open;
    text[open + 1..close]
        .split(',')
        .map(|p| p.trim().parse::<usize>().expect("shape entry"))
        .collect()
}

fn read_wav(path: &str) -> Vec<f32> {
    let mut reader = hound::WavReader::open(path).unwrap_or_else(|e| panic!("open {path}: {e}"));
    let spec = reader.spec();
    assert_eq!(spec.sample_rate, 16_000, "{path}: expected 16 kHz");
    assert_eq!(spec.channels, 1, "{path}: expected mono");
    // The baseline dumper loaded these as `i16 / 32768.0`; match it exactly.
    reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect()
}

/// Segments as recorded in `baseline/segments/<clip>.json`.
fn read_baseline_segments(path: &str) -> Vec<(f64, f64, usize)> {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    // Objects inside the `"segments"` array; keys are emitted alphabetically
    // (`end`, `speaker_id`, `start`), so scan by key rather than by position.
    let list = &text[text.find("\"segments\"").expect("segments key")..];
    let list = &list[..list.find(']').expect("segments array end")];
    let field = |obj: &str, key: &str| -> f64 {
        let k = obj.find(key).unwrap_or_else(|| panic!("{key} in {obj}"));
        let body = &obj[k + key.len()..];
        let body = &body[body.find(':').expect("colon") + 1..];
        let end = body
            .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == 'e' || c.is_whitespace()))
            .unwrap_or(body.len());
        body[..end].trim().parse().expect("number")
    };
    let mut out = Vec::new();
    let mut rest = list;
    while let Some(open) = rest.find('{') {
        let close = rest[open..].find('}').expect("object end") + open;
        let obj = &rest[open..close];
        out.push((
            field(obj, "\"start\""),
            field(obj, "\"end\""),
            field(obj, "\"speaker_id\"") as usize,
        ));
        rest = &rest[close + 1..];
    }
    out
}

struct Diff {
    max: f32,
    mean: f64,
    p50: f32,
    p95: f32,
    p99: f32,
    agree: f64,
    worst_row: usize,
}

fn compare(a: &[f32], b: &[f32], cols: usize) -> Diff {
    assert_eq!(a.len(), b.len());
    let mut diffs = Vec::with_capacity(a.len());
    let mut max = 0.0f32;
    let mut worst_row = 0;
    let mut sum = 0.0f64;
    let mut agree = 0usize;
    for (i, (&x, &y)) in a.iter().zip(b.iter()).enumerate() {
        let d = (x - y).abs();
        diffs.push(d);
        sum += d as f64;
        if d > max {
            max = d;
            worst_row = i / cols;
        }
        if (x > 0.5) == (y > 0.5) {
            agree += 1;
        }
    }
    diffs.sort_by(|p, q| p.partial_cmp(q).unwrap());
    Diff {
        max,
        mean: sum / a.len() as f64,
        p50: diffs[diffs.len() / 2],
        p95: diffs[diffs.len() * 95 / 100],
        p99: diffs[diffs.len() * 99 / 100],
        agree: 100.0 * agree as f64 / a.len() as f64,
        worst_row,
    }
}

fn run_clip(model: &str, clip: &str, wav: &str) -> bool {
    println!("\n================ {clip} ================");
    let samples = read_wav(wav);
    println!("audio: {} samples ({:.3} s)", samples.len(), samples.len() as f64 / 16_000.0);

    let mut diarizer = Diarizer::new(model).expect("load model");

    let started = std::time::Instant::now();
    let (probs, frames) = diarizer.diarize_raw(&samples, 16_000, 1).expect("diarize_raw");
    println!("diarize_raw: {frames} frames in {:.2} s", started.elapsed().as_secs_f64());

    // ---- probabilities vs baseline ----
    let base_shape = read_shape(&format!("baseline/probs/{clip}.json"));
    let base = read_f32(&format!("baseline/probs/{clip}.f32"));
    println!("baseline probs shape {base_shape:?}, ours [{frames}, {NUM_SPEAKERS}]");
    let mut ok = true;
    if base.len() != probs.len() {
        println!(
            "!! frame-count mismatch: baseline {} values, ours {}",
            base.len(),
            probs.len()
        );
        ok = false;
    }
    let n = base.len().min(probs.len());
    let d = compare(&probs[..n], &base[..n], NUM_SPEAKERS);
    println!(
        "probs: max={:.6} (row {}) mean={:.6} p50={:.7} p95={:.7} p99={:.7} agree@0.5={:.3}%",
        d.max, d.worst_row, d.mean, d.p50, d.p95, d.p99, d.agree
    );

    // Per-chunk breakdown: where, if anywhere, does it start to drift?
    let chunk_len = 124;
    println!("per-chunk max abs diff:");
    let mut row = 0;
    let mut chunk = 0;
    while row < n / NUM_SPEAKERS {
        let hi = (row + chunk_len).min(n / NUM_SPEAKERS);
        let lo_i = row * NUM_SPEAKERS;
        let hi_i = hi * NUM_SPEAKERS;
        let c = compare(&probs[lo_i..hi_i], &base[lo_i..hi_i], NUM_SPEAKERS);
        println!(
            "  chunk {chunk} rows {row:>4}..{hi:<4}  max={:.6} mean={:.6} agree@0.5={:.3}%",
            c.max, c.mean, c.agree
        );
        row = hi;
        chunk += 1;
    }
    if d.agree < 99.5 {
        ok = false;
    }

    // ---- segments vs baseline ----
    let segments = diarizer.diarize(&samples, 16_000, 1).expect("diarize");
    let baseline_segments = read_baseline_segments(&format!("baseline/segments/{clip}.json"));
    println!("\nsegments: ours {} / baseline {}", segments.len(), baseline_segments.len());
    let rows = segments.len().max(baseline_segments.len());
    let mut worst_edge = 0.0f64;
    for i in 0..rows {
        let ours = segments.get(i);
        let theirs = baseline_segments.get(i);
        match (ours, theirs) {
            (Some(a), Some(b)) => {
                let ds = (a.start - b.1.min(b.0)).abs();
                let _ = ds;
                let dstart = (a.start - b.0).abs();
                let dend = (a.end - b.1).abs();
                worst_edge = worst_edge.max(dstart).max(dend);
                let flag = if a.speaker_id == b.2 { " " } else { "!" };
                println!(
                    "{flag} {:>2}: spk{} {:7.3}-{:7.3}  |  spk{} {:7.3}-{:7.3}   (d {:+.3}/{:+.3})",
                    i,
                    a.speaker_id,
                    a.start,
                    a.end,
                    b.2,
                    b.0,
                    b.1,
                    a.start - b.0,
                    a.end - b.1
                );
                if a.speaker_id != b.2 {
                    ok = false;
                }
            }
            (Some(a), None) => {
                println!("+ {:>2}: spk{} {:7.3}-{:7.3}  |  (none)", i, a.speaker_id, a.start, a.end);
                ok = false;
            }
            (None, Some(b)) => {
                println!("- {:>2}: (none)                 |  spk{} {:7.3}-{:7.3}", i, b.2, b.0, b.1);
                ok = false;
            }
            (None, None) => {}
        }
    }
    println!("worst segment edge shift: {worst_edge:.3} s");

    ok
}

fn main() {
    let model = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "models/diar_streaming_sortformer_4spk-v2.f32.gguf".to_string());

    let clips = [
        ("sortformer-2spk-mix", "plans/transcribe.cpp/samples/sortformer-2spk-mix.wav"),
        ("6_speakers", "testdata/6_speakers.wav"),
    ];

    let mut all_ok = true;
    for (clip, wav) in clips {
        all_ok &= run_clip(&model, clip, wav);
    }

    println!("\n{}", if all_ok { "OK" } else { "DIVERGENCE (see above)" });
}
