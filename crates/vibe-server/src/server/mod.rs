mod ready_signal;
pub(crate) mod requests;
mod routes;

mod handlers;

use anyhow::Result;
use tokio::net::TcpListener;

use crate::state::SharedState;

pub async fn listen_and_serve(host: &str, port: u16, state: SharedState) -> Result<()> {
    let listener = TcpListener::bind(format!("{host}:{port}")).await?;
    ready_signal::print(listener.local_addr()?.port(), &state).await?;
    axum::serve(listener, routes::router(state).into_make_service()).await?;
    Ok(())
}
