use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{ArgAction, Parser, Subcommand};
use whisper_rs::{TranscribeOptions, WhisperContext, list_gpu_devices};

use crate::audio::read_audio_mono_f32;
use crate::parent::watch_parent;
use crate::server::listen_and_serve;
use crate::state::ServerState;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const COMMIT: &str = match option_env!("VIBE_COMMIT") {
    Some(commit) => commit,
    None => "dev",
};

#[derive(Debug, Parser)]
#[command(name = "vibe-server", version = VERSION, about = "Vibe local transcription sidecar")]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Serve {
        #[arg(long, default_value = "127.0.0.1")]
        host: String,
        #[arg(long, short, default_value_t = 0)]
        port: u16,
        #[arg(long, default_value_t = true, action = ArgAction::Set)]
        exit_with_parent: bool,
        model: Option<PathBuf>,
    },
    Transcribe {
        model: PathBuf,
        audio: PathBuf,
        #[arg(long, short, default_value = "")]
        language: String,
        #[arg(long)]
        translate: bool,
        #[arg(long)]
        detect_language: bool,
        #[arg(long, default_value_t = -1)]
        gpu_device: i32,
        #[arg(long)]
        no_gpu: bool,
    },
    Devices,
}

pub async fn run() -> Result<()> {
    match Args::parse().command {
        Command::Serve {
            host,
            port,
            exit_with_parent,
            model,
        } => {
            if exit_with_parent {
                tokio::spawn(watch_parent());
            }
            let state = ServerState::new(VERSION, COMMIT);
            if let Some(path) = model {
                state.load_model(path.to_string_lossy().as_ref(), None, false).await?;
            }
            listen_and_serve(&host, port, state).await
        }
        Command::Transcribe {
            model,
            audio,
            language,
            translate,
            detect_language,
            gpu_device,
            no_gpu,
        } => {
            let samples = read_audio_mono_f32(&audio, false).context("read audio")?;
            let device = (gpu_device >= 0).then_some(gpu_device);
            let mut ctx = WhisperContext::new(model.to_string_lossy().as_ref(), device, no_gpu)?;
            let result = ctx.transcribe(
                &samples,
                TranscribeOptions {
                    language,
                    translate,
                    detect_language,
                    ..Default::default()
                },
            )?;
            println!("{}", result.text());
            Ok(())
        }
        Command::Devices => {
            println!("{}", serde_json::to_string_pretty(&list_gpu_devices())?);
            Ok(())
        }
    }
}
