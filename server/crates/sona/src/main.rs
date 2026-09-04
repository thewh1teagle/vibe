mod audio;
mod cli;
mod engine;
mod parent;
mod pull;
mod server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Logs go to stderr so stdout stays reserved for the ready handshake and
    // for command output.
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    cli::run().await
}
