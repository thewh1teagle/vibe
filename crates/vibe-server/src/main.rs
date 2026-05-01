mod audio;
mod cli;
mod diarization;
mod docs;
mod errors;
mod formats;
mod parent;
mod server;
mod state;
mod transcription;

#[tokio::main]
async fn main() {
    if let Err(err) = cli::run().await {
        eprintln!("{err:#}");
        std::process::exit(1);
    }
}
