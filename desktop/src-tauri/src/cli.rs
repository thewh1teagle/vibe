use clap::Parser;
use eyre::{Context, ContextCompat, Result};
use once_cell::sync::Lazy;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process;
use std::time::Instant;
use tauri::AppHandle;
use vibe_core::config::TranscribeOptions;
use vibe_core::transcribe;

use crate::cmd::get_models_folder;
use crate::server;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

/// Attach to console if cli detected in Windows
#[cfg(all(windows, not(debug_assertions)))]
pub fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    let attach_result = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    if attach_result.is_ok() {
        // Wer'e in CLI
        // Experimental: redirect stdout and stderr to the new console. otherwise c++ bindings writes won't show.
        // https://users.rust-lang.org/t/stderr-write-from-c-bindings-missing-on-windows/116582
        unsafe {
            let conout = std::ffi::CString::new("CONOUT$").expect("CString::new failed");
            let stdout = libc_stdhandle::stdout();
            let stderr = libc_stdhandle::stderr();
            let mode = std::ffi::CString::new("w").unwrap();
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stdout);
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stderr);
        }
        tracing::debug!("CLI detected. attached console successfuly");
    } else {
        tracing::debug!("No CLI detected.");
    }
}

pub fn is_cli_detected() -> bool {
    // Get the command-line arguments as an iterator
    let args: Vec<String> = std::env::args().collect();

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
    model: Option<PathBuf>,

    /// Path to file to transcribe
    #[arg(long)]
    file: Option<String>,

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

    /// Enable diarize (speaker labels)
    #[arg(long)]
    diarize: bool,

    /// Path to vad model
    #[arg(long)]
    pub diarize_vad_model: Option<String>,

    /// Path to speaker id model
    #[arg(long)]
    diarize_speaker_id_model: Option<String>,

    /// Run http server
    #[arg(long)]
    server: bool,

    #[arg(long, default_value = "0.0.0.0")]
    host: String,

    /// Port
    #[arg(long, default_value = "3022")]
    port: u16,
}

fn get_possible_languages() -> Vec<String> {
    let languages = include_str!("../../src/assets/whisper-languages.json");
    let languages: Value = serde_json::from_str(languages).expect("whisper languages");
    let languages = languages
        .as_object()
        .expect("whisper languages deserialize erroo")
        .keys()
        .cloned()
        .collect::<Vec<String>>();
    languages
}

pub fn get_possible_formats() -> Vec<String> {
    vec!["txt".into(), "srt".into(), "vtt".into()]
}

fn prepare_model_path(path: &Path, app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    // Check if relative to current dir
    if path.exists() {
        return Ok(path.to_path_buf());
    }
    // Check if relative to app config exists
    let relative_to_models_folder = get_models_folder(app_handle.clone())?.join(path);
    if relative_to_models_folder.exists() {
        return Ok(relative_to_models_folder);
    }
    Ok(path.to_path_buf())
}

fn language_name_to_whisper_lang(name: &str) -> Result<String> {
    let languages_json = include_str!("../../src/assets/whisper-languages.json");
    let languages: Value = serde_json::from_str(languages_json).context("tostr")?;
    Ok(languages[name].as_str().context("as_str")?.to_string())
}

pub async fn run(app_handle: &AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    crate::dock::set_dock_visible(false);

    #[allow(unused_mut)]
    let mut args = Args::parse();

    if args.diarize && args.diarize_vad_model.is_none() {
        panic!("Please provide model path with --diarize-vad-model")
    }
    if args.diarize {
        args.word_timestamps = true;
        args.max_sentence_len = Some(24);
        args.format = "json".into();
    }

    if args.server {
        server::run(app_handle.clone(), args.host, args.port).await?;
    }
    let lang = language_name_to_whisper_lang(&args.language)?;
    let options = TranscribeOptions {
        path: args.file.context("file")?,
        lang: Some(lang),
        init_prompt: args.init_prompt,
        n_threads: args.n_threads,
        temperature: args.temperature,
        translate: args.translate,
        verbose: Some(false),
        max_text_ctx: args.max_text_ctx,
        word_timestamps: Some(args.word_timestamps),
        max_sentence_len: args.max_sentence_len,
    };
    let model_path = prepare_model_path(&args.model.context("model")?, app_handle)?;

    eprintln!("Transcribe... 🔄");
    let start = Instant::now(); // Measure start time
    let ctx = transcribe::create_context(&model_path, None)?;
    #[allow(unused_mut)]
    let mut transcript = transcribe::transcribe(&ctx, &options, None, None, None, None)?;

    let elapsed = start.elapsed();
    println!(
        "{}",
        match args.format.as_str() {
            "srt" => transcript.as_srt(),
            "vtt" => transcript.as_vtt(),
            "txt" => transcript.as_text(),
            "json" => transcript.as_json()?,
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

    app_handle.cleanup_before_exit();
    eprintln!(
        "Transcription completed in {:.1}s ⏱️",
        elapsed.as_secs_f64() + elapsed.subsec_nanos() as f64 * 1e-9
    );
    eprintln!("Done ✅");
    process::exit(0);
}
