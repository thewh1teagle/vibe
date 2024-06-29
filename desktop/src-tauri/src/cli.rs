use clap::Parser;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::{env, process};
use tauri::App;
use vibe_core::config::TranscribeOptions;
use vibe_core::model;

use crate::cmd::get_models_folder;

/// Attach to console if cli detected in Windows
#[cfg(windows)]
pub fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    if env::var("RUST_LOG").is_ok() || is_cli_detected() {
        // we ignore the result here because
        // if the app started from a command line, like cmd or powershell,
        // it will attach sucessfully which is what we want
        // but if we were started from something like explorer,
        // it will fail to attach console which is also what we want.
        let _ = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    }
}

pub fn is_cli_detected() -> bool {
    // Get the command-line arguments as an iterator
    let args: Vec<String> = env::args().collect();

    // Check if any argument starts with "--"
    for arg in &args {
        if arg.starts_with("--") || arg == "-h" {
            return true;
        }
    }
    false
}

/// Simple program to greet a person
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Path to model
    #[arg(long, short)]
    model: PathBuf,

    /// Path to file to transcribe
    #[arg(long)]
    file: PathBuf,

    /// Language to transcribe
    #[arg(short, long, default_value = "english", value_parser = get_possible_languages())]
    language: String,

    /// Temperature (default: 0.4)
    #[arg(short, long, default_value = "0.4")]
    temperature: Option<f32>,

    /// Number of threads (default: 4)
    #[arg(short, long, default_value = "4")]
    n_threads: Option<i32>,

    /// Whether to translate (default: false)
    #[arg(long)]
    translate: Option<bool>,

    /// Max tokens
    #[arg(long)]
    max_text_ctx: Option<i32>,

    /// Initial prompt (default: None)
    #[arg(short, long)]
    init_prompt: Option<String>,

    /// Path to write transcript
    #[arg(short, long)]
    write: Option<PathBuf>,

    /// Format of the transcript
    #[arg(short, long, default_value = "srt", value_parser = get_possible_formats())]
    // TODO: use possible values. confusing crate!
    format: String,

    /// Format of the transcript
    #[arg(long)]
    // TODO: use possible values. confusing crate!
    word_timestamps: bool,

    /// Format of the transcript
    #[arg(long)]
    // TODO: use possible values. confusing crate!
    max_sentence_len: Option<i32>,
}

fn get_possible_languages() -> Vec<String> {
    let languages = include_str!("../../src/assets/whisper-languages.json");
    let languages: Value = serde_json::from_str(languages).unwrap();
    let languages = languages.as_object().unwrap().keys().cloned().collect::<Vec<String>>();
    languages
}

pub fn get_possible_formats() -> Vec<String> {
    vec!["txt".into(), "srt".into(), "vtt".into()]
}

fn prepare_model_path(path: &Path, app_handle: &tauri::AppHandle) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }
    // Check if relative to current dir
    if path.exists() {
        return path.to_path_buf();
    }
    // Check if relative to app config exists
    let relative_to_models_folder = get_models_folder(app_handle.clone()).unwrap().join(path);
    if relative_to_models_folder.exists() {
        return relative_to_models_folder;
    }
    path.to_path_buf()
}

fn language_name_to_whisper_lang(name: &str) -> String {
    let languages_json = include_str!("../../src/assets/whisper-languages.json");
    let languages: Value = serde_json::from_str(languages_json).unwrap();
    languages[name].as_str().unwrap().to_string()
}

pub fn run(app: &App) {
    #[cfg(target_os = "macos")]
    crate::dock::set_dock_visible(false);

    let args = Args::parse();
    let lang = language_name_to_whisper_lang(&args.language);
    let options = TranscribeOptions {
        path: args.file,
        lang: Some(lang),
        init_prompt: args.init_prompt,
        n_threads: args.n_threads,
        temperature: args.temperature,
        translate: args.translate,
        verbose: false,
        max_text_ctx: args.max_text_ctx,
        word_timestamps: Some(args.word_timestamps),
        max_sentence_len: args.max_sentence_len,
    };
    let model_path = prepare_model_path(&args.model, app.handle());

    eprintln!("Transcribe... 🔄");
    let start = Instant::now(); // Measure start time
    let ctx = model::create_context(&model_path, None).unwrap();
    let transcript = model::transcribe(&ctx, &options, None, None, None).unwrap();
    let elapsed = start.elapsed();
    println!(
        "{}",
        match args.format.as_str() {
            "srt" => transcript.as_srt(),
            "vtt" => transcript.as_vtt(),
            "txt" => transcript.as_text(),
            _ => {
                eprintln!("Invalid format specified. Defaulting to SRT format.");
                transcript.as_srt()
            }
        }
    );

    // Write transcript if write path is provided
    if let Some(write_path) = args.write {
        if let Err(err) = std::fs::write(
            write_path,
            match args.format.as_str() {
                "srt" => transcript.as_srt(),
                "vtt" => transcript.as_vtt(),
                "txt" => transcript.as_text(),
                _ => {
                    eprintln!("Invalid format specified. Defaulting to SRT format.");
                    transcript.as_srt()
                }
            },
        ) {
            eprintln!("Error writing transcript to file: {}", err);
        }
    }

    app.cleanup_before_exit();
    eprintln!(
        "Transcription completed in {:.1}s ⏱️",
        elapsed.as_secs_f64() + elapsed.subsec_nanos() as f64 * 1e-9
    );
    eprintln!("Done ✅");
    process::exit(0);
}
