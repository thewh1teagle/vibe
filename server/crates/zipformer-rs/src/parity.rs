//! Encoder parity against the PyTorch reference dumps.
//!
//! `ZIPFORMER_REF_DIR=<ref> ZIPFORMER_GGUF=<f32 gguf> cargo test -p zipformer-rs --release parity -- --ignored --nocapture`
//! Set `ZIPFORMER_GGUF_Q8` as well to compare the quantized model.

use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use crate::encoder::{Encoder, EncoderOutput, EncoderStages};
use crate::fbank::testdata::{clip, gguf, Npy, CLIPS};
use crate::fbank::Features;
use crate::load::Weights;

fn features(name: &str) -> Features {
    let npy = Npy::read(&clip(name).join("fbank.npy"));
    Features {
        frames: npy.shape[0],
        bins: npy.shape[1],
        data: npy.f32(),
    }
}

/// (max abs, mean abs)
fn error(got: &[f32], want: &[f32]) -> (f32, f32) {
    assert_eq!(got.len(), want.len());
    let mut max = 0.0f32;
    let mut sum = 0.0f64;
    for (a, b) in got.iter().zip(want) {
        let diff = (a - b).abs();
        assert!(diff.is_finite(), "non-finite value");
        max = max.max(diff);
        sum += diff as f64;
    }
    (max, (sum / got.len().max(1) as f64) as f32)
}

fn stage_list(stages: &EncoderStages) -> Vec<(String, &EncoderOutput)> {
    let mut list = vec![("encoder_embed".to_owned(), &stages.embed)];
    list.extend(
        stages
            .stacks
            .iter()
            .enumerate()
            .map(|(index, stack)| (format!("stack{index}"), stack)),
    );
    list.push(("encoder_out".to_owned(), &stages.output));
    list
}

fn against_reference(name: &str, stages: &EncoderStages) -> f32 {
    let mut worst = 0.0f32;
    for (stage, got) in stage_list(stages) {
        let want = Npy::read(&clip(name).join(format!("{stage}.npy")));
        assert_eq!(want.shape, [got.frames, got.dim], "{name} {stage}");
        let (max, mean) = error(&got.data, &want.f32());
        println!("{name:9} {stage:14} max_abs={max:.3e} mean_abs={mean:.3e}");
        worst = worst.max(max);
    }
    worst
}

fn against(label: &str, name: &str, stages: &EncoderStages, baseline: &EncoderStages) {
    for ((stage, got), (_, want)) in stage_list(stages).into_iter().zip(stage_list(baseline)) {
        let (max, mean) = error(&got.data, &want.data);
        println!("{label} {name:9} {stage:14} max_abs={max:.3e} mean_abs={mean:.3e}");
    }
}

fn run_all(path: &Path, use_gpu: bool) -> (Encoder, Vec<EncoderStages>) {
    let mut encoder = Encoder::new(Arc::new(Weights::open(path).unwrap()), use_gpu).unwrap();
    let stages = CLIPS
        .iter()
        .map(|name| encoder.forward_stages(&features(name)).unwrap())
        .collect();
    (encoder, stages)
}

fn timed(label: &str, encoder: &mut Encoder) {
    let input = features("tts28");
    for pass in 0..3 {
        let started = Instant::now();
        let output = encoder.forward(&input).unwrap();
        println!(
            "{label} tts28 pass={pass} frames_in={} frames_out={} wall_ms={}",
            input.frames,
            output.frames,
            started.elapsed().as_millis()
        );
    }
}

#[test]
#[ignore = "needs ZIPFORMER_REF_DIR and ZIPFORMER_GGUF"]
fn parity_with_reference() {
    let (mut cpu, cpu_stages) = run_all(&gguf(), false);
    println!("== f32 cpu vs reference");
    let mut worst = 0.0f32;
    for (name, stages) in CLIPS.iter().zip(&cpu_stages) {
        worst = worst.max(against_reference(name, stages));
    }
    timed("f32-cpu", &mut cpu);

    let (mut gpu, gpu_stages) = run_all(&gguf(), true);
    if gpu.on_gpu() {
        println!("== f32 gpu vs f32 cpu");
        for ((name, stages), baseline) in CLIPS.iter().zip(&gpu_stages).zip(&cpu_stages) {
            against("f32-gpu", name, stages, baseline);
        }
        timed("f32-gpu", &mut gpu);
    } else {
        println!("== no gpu backend");
    }

    if let Some(path) = std::env::var_os("ZIPFORMER_GGUF_Q8") {
        for (label, use_gpu) in [("q8-cpu", false), ("q8-gpu", true)] {
            let (mut encoder, stages) = run_all(Path::new(&path), use_gpu);
            if use_gpu && !encoder.on_gpu() {
                continue;
            }
            println!("== {label} vs f32 cpu");
            for ((name, stages), baseline) in CLIPS.iter().zip(&stages).zip(&cpu_stages) {
                against(label, name, stages, baseline);
            }
            timed(label, &mut encoder);
        }
    }
    assert!(worst < 1.0e-3, "f32 cpu is {worst:e} away from the reference");
}
