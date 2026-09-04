use crate::engine::Engine;
use clap::{Parser, Subcommand};
use whisper_rs::{ContextOptions, TranscribeOptions};

use crate::server::format;
use crate::{audio, pull, server};

const VERSION: &str = match option_env!("SONA_VERSION") {
    Some(value) => value,
    None => "dev",
};
const COMMIT: &str = match option_env!("SONA_COMMIT") {
    Some(value) => value,
    None => "dev",
};

#[derive(Debug, Parser)]
#[command(name = "sona", version = VERSION, about = "Speech-to-text powered by whisper.cpp")]
struct Cli {
    #[arg(short, long, global = true)]
    verbose: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Transcribe {
        model: String,
        audio: String,
        #[arg(long)]
        vad_model: Option<String>,
        #[arg(short, long)]
        language: Option<String>,
        #[arg(long)]
        detect_language: bool,
        #[arg(long)]
        enhance_audio: bool,
        #[arg(long)]
        translate: bool,
        #[arg(long, default_value_t = 0)]
        threads: i32,
        #[arg(long)]
        prompt: Option<String>,
        #[arg(long, default_value_t = 0.0)]
        temperature: f32,
        #[arg(long, default_value_t = 0)]
        max_text_ctx: i32,
        #[arg(long)]
        word_timestamps: bool,
        #[arg(long, default_value_t = 0)]
        max_segment_len: i32,
        #[arg(long, default_value_t = 0)]
        best_of: i32,
        #[arg(long, default_value_t = 0)]
        beam_size: i32,
        #[arg(long, default_value_t = -1)]
        gpu_device: i32,
    },
    Serve {
        model: Option<String>,
        #[arg(long, default_value = "127.0.0.1")]
        host: String,
        #[arg(short, long, default_value_t = 0)]
        port: u16,
        #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
        exit_with_parent: bool,
        #[arg(long, env = "SONA_UNLOAD_TIMEOUT", default_value = "0")]
        unload_timeout: crate::server::unload_timeout::UnloadTimeout,
    },
    Pull {
        url: String,
        #[arg(short, long)]
        output: Option<String>,
    },
    Devices,
}

#[derive(Debug, Clone, Copy)]
pub struct AppConfig {
    verbose: bool,
    version: &'static str,
    commit: &'static str,
}

impl AppConfig {
    pub fn verbose(&self) -> bool {
        self.verbose
    }

    pub fn version(&self) -> &'static str {
        self.version
    }

    pub fn commit(&self) -> &'static str {
        self.commit
    }
}

pub async fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let config = AppConfig {
        verbose: cli.verbose,
        version: VERSION,
        commit: COMMIT,
    };

    match cli.command {
        Command::Transcribe {
            model,
            audio,
            vad_model,
            language,
            detect_language,
            enhance_audio,
            translate,
            threads,
            prompt,
            temperature,
            max_text_ctx,
            word_timestamps,
            max_segment_len,
            best_of,
            beam_size,
            gpu_device,
        } => {
            transcribe_command(
                TranscribeArgs {
                    model,
                    audio,
                    vad_model,
                    language,
                    detect_language,
                    enhance_audio,
                    translate,
                    threads,
                    prompt,
                    temperature,
                    max_text_ctx,
                    word_timestamps,
                    max_segment_len,
                    best_of,
                    beam_size,
                    gpu_device,
                },
                config,
            )
            .await
        }
        Command::Serve {
            model,
            host,
            port,
            exit_with_parent,
            unload_timeout,
        } => {
            if exit_with_parent {
                crate::parent::watch();
            }
            server::serve(host, port, model, unload_timeout, config).await
        }
        Command::Pull { url, output } => pull::pull_file(&url, output.as_deref()).await,
        Command::Devices => devices_command(config),
    }
}

async fn transcribe_command(args: TranscribeArgs, config: AppConfig) -> anyhow::Result<()> {
    whisper_rs::set_verbose(config.verbose());
    let samples = audio::read_file_with_options(
        &args.audio,
        audio::ReadOptions {
            enhance_audio: args.enhance_audio,
            verbose: config.verbose(),
        },
    )?;
    let mut ctx = Engine::load(
        &args.model,
        ContextOptions {
            gpu_device: args.gpu_device,
            no_gpu: false,
        },
    )
    .inspect_err(|err| tracing::error!(model = args.model, "failed to load model: {err:#}"))?;
    let result = ctx.transcribe(
        &samples,
        TranscribeOptions {
            language: args.language,
            detect_language: args.detect_language,
            translate: args.translate,
            threads: args.threads,
            prompt: args.prompt,
            verbose: config.verbose(),
            temperature: args.temperature,
            max_text_ctx: args.max_text_ctx,
            word_timestamps: args.word_timestamps,
            // One word per segment is what --word-timestamps is asking for, unless
            // the caller picked a length themselves.
            max_segment_len: if args.word_timestamps && args.max_segment_len == 0 {
                1
            } else {
                args.max_segment_len
            },
            best_of: args.best_of,
            beam_size: args.beam_size,
            vad_model_path: args.vad_model,
            ..TranscribeOptions::default()
        },
    )
    .inspect_err(|err| tracing::error!("transcription failed: {err:#}"))?;

    if args.word_timestamps {
        // whisper.cpp emits one segment per word here, plus a leading empty one for
        // the silence before speech starts.
        let words = result.segments.iter().filter(|segment| !segment.text.trim().is_empty());
        for word in words {
            println!(
                "[{} --> {}] {}",
                format::cs_to_vtt_time(word.start),
                format::cs_to_vtt_time(word.end),
                word.text.trim()
            );
        }
    } else {
        println!("{}", result.text());
    }
    Ok(())
}

fn devices_command(config: AppConfig) -> anyhow::Result<()> {
    whisper_rs::set_verbose(config.verbose());
    let devices: Vec<_> = whisper_rs::list_gpu_devices()
        .into_iter()
        .map(|device| {
            serde_json::json!({
                "index": device.index,
                "name": device.name,
                "description": device.description,
                "type": match device.device_type {
                    whisper_rs::GPUDeviceType::Gpu => "gpu",
                    whisper_rs::GPUDeviceType::IntegratedGpu => "igpu",
                },
            })
        })
        .collect();
    println!("{}", serde_json::to_string_pretty(&devices)?);
    Ok(())
}

struct TranscribeArgs {
    model: String,
    audio: String,
    vad_model: Option<String>,
    language: Option<String>,
    detect_language: bool,
    enhance_audio: bool,
    translate: bool,
    threads: i32,
    prompt: Option<String>,
    temperature: f32,
    max_text_ctx: i32,
    word_timestamps: bool,
    max_segment_len: i32,
    best_of: i32,
    beam_size: i32,
    gpu_device: i32,
}
