use clap::Parser;
use eyre::{Context, ContextCompat, Result};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process;
use std::time::Instant;
use tauri::AppHandle;

use crate::cmd::get_models_folder;

/// Attach to console if cli detected in Windows
#[cfg(all(windows, not(debug_assertions)))]
pub fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    let attach_result = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    if attach_result.is_ok() {
        unsafe {
            let conout = std::ffi::CString::new("CONOUT$").expect("CString::new failed");
            let stdout = libc_stdhandle::stdout();
            let stderr = libc_stdhandle::stderr();
            let mode = std::ffi::CString::new("w").unwrap();
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stdout);
            libc::freopen(conout.as_ptr(), mode.as_ptr(), stderr);
        }
        tracing::debug!("CLI detected. attached console successfully");
    } else {
        tracing::debug!("No CLI detected.");
    }
}

pub fn is_cli_detected() -> bool {
    let args: Vec<String> = std::env::args().collect();
    for arg in &args {
        if arg.starts_with("--") || arg == "-h" {
            return true;
        }
    }
    false
}

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

    /// Whether to translate (default: false)
    #[arg(long)]
    translate: Option<bool>,

    /// Initial prompt (default: None)
    #[arg(short, long)]
    init_prompt: Option<String>,

    /// Path to write transcript
    #[arg(short, long)]
    write: Option<PathBuf>,

    /// Format of the transcript
    #[arg(short, long, default_value = "srt", value_parser = get_possible_formats())]
    format: String,
}

fn get_possible_languages() -> Vec<String> {
    let languages = include_str!("../../src/assets/whisper-languages.json");
    let languages: Value = serde_json::from_str(languages).expect("whisper languages");
    let languages = languages
        .as_object()
        .expect("whisper languages deserialize error")
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
    if path.exists() {
        return Ok(path.to_path_buf());
    }
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

fn resolve_sona_binary_cli() -> Result<PathBuf> {
    #[cfg(target_os = "windows")]
    let binary_name = "sona.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "sona";

    // Check in same directory as the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let path = exe_dir.join(binary_name);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    // Fallback: check PATH
    if let Ok(path) = which::which(binary_name) {
        return Ok(path);
    }

    eyre::bail!("sona binary not found")
}

pub async fn run(app_handle: &AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    crate::dock::set_dock_visible(false);

    let args = Args::parse();

    let lang = language_name_to_whisper_lang(&args.language)?;
    let model_path = prepare_model_path(&args.model.context("model")?, app_handle)?;
    let audio_path = args.file.context("file")?;

    let sona_binary = resolve_sona_binary_cli()?;

    eprintln!("Transcribe... ");
    let start = Instant::now();

    let mut cmd = std::process::Command::new(&sona_binary);
    cmd.args(["transcribe", model_path.to_str().context("model path")?, &audio_path]);

    if !lang.is_empty() {
        cmd.args(["--language", &lang]);
    }
    if args.translate.unwrap_or(false) {
        cmd.arg("--translate");
    }
    if let Some(ref prompt) = args.init_prompt {
        cmd.args(["--prompt", prompt]);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().context("failed to spawn sona transcribe")?;

    let mut output_text = String::new();
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = line?;
            println!("{}", line);
            output_text.push_str(&line);
            output_text.push('\n');
        }
    }

    let status = child.wait()?;
    if !status.success() {
        let mut stderr_output = String::new();
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    stderr_output.push_str(&line);
                    stderr_output.push('\n');
                }
            }
        }
        eyre::bail!("sona transcribe failed: {}", stderr_output);
    }

    // Write transcript if write path is provided
    if let Some(write_path) = args.write {
        if let Err(err) = std::fs::write(&write_path, &output_text) {
            eprintln!("Error writing transcript to file: {}", err);
        }
    }

    let elapsed = start.elapsed();

    app_handle.cleanup_before_exit();
    eprintln!(
        "Transcription completed in {:.1}s",
        elapsed.as_secs_f64()
    );
    eprintln!("Done");
    process::exit(0);
}
