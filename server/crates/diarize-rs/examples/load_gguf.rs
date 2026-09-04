//! Smoke test for the GGUF backend: load the model and report what resolved.
//!
//! This is the first real check that the tensor names and shapes in
//! `sf_weights.rs` match the file the converter actually produced.
//!
//!     cargo run -p diarize-rs --example load_gguf -- models/....f32.gguf

fn main() {
    let path = std::env::args().nth(1).expect("usage: load_gguf <model.gguf>");
    match diarize_rs::sf_weights::SortformerWeights::load(&path) {
        Ok(weights) => {
            let hp = weights.hparams();
            println!("loaded ok: {path}");
            println!("{hp:#?}");
        }
        Err(error) => {
            eprintln!("load failed: {error}");
            std::process::exit(1);
        }
    }
}
