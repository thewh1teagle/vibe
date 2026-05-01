use anyhow::Result;
use serde::Serialize;

use crate::state::SharedState;

pub async fn print(port: u16, state: &SharedState) -> Result<()> {
    let status = state.status().await;
    let signal = ReadySignal {
        status: "ready",
        port,
        version: &status.version,
        commit: &status.commit,
    };
    println!("{}", serde_json::to_string(&signal)?);
    Ok(())
}

#[derive(Serialize)]
struct ReadySignal<'a> {
    status: &'a str,
    port: u16,
    version: &'a str,
    commit: &'a str,
}
