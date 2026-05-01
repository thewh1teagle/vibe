use std::sync::Arc;

use anyhow::{Result, anyhow};
use serde::Serialize;
use tokio::sync::{Mutex, OwnedMutexGuard, TryLockError};
use whisper_rs::WhisperContext;

pub type SharedState = Arc<ServerState>;

pub struct ServerState {
    inner: Arc<Mutex<InnerState>>,
    version: String,
    commit: String,
}

struct InnerState {
    context: Option<WhisperContext>,
    model_name: String,
    model_path: String,
}

impl ServerState {
    pub fn new(version: &str, commit: &str) -> SharedState {
        Arc::new(Self {
            inner: Arc::new(Mutex::new(InnerState {
                context: None,
                model_name: String::new(),
                model_path: String::new(),
            })),
            version: version.to_string(),
            commit: commit.to_string(),
        })
    }

    pub async fn load_model(&self, path: &str, gpu_device: Option<i32>, no_gpu: bool) -> Result<String> {
        let mut state = self.inner.lock().await;
        let context = WhisperContext::new(path, gpu_device, no_gpu)?;
        state.context = Some(context);
        state.model_path = path.to_string();
        state.model_name = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(path)
            .to_string();
        Ok(state.model_name.clone())
    }

    pub async fn unload_model(&self) {
        let mut state = self.inner.lock().await;
        state.context = None;
        state.model_name.clear();
        state.model_path.clear();
    }

    pub async fn status(&self) -> ModelStatus {
        let state = self.inner.lock().await;
        ModelStatus {
            loaded: state.context.is_some(),
            model_name: state.model_name.clone(),
            model_path: state.model_path.clone(),
            version: self.version.clone(),
            commit: self.commit.clone(),
        }
    }

    pub fn try_transcriber(&self) -> Result<TranscriberGuard<'_>, TryLockError> {
        self.inner.try_lock().map(|guard| TranscriberGuard { guard })
    }

    pub fn try_transcriber_owned(&self) -> Result<OwnedTranscriberGuard, TryLockError> {
        self.inner
            .clone()
            .try_lock_owned()
            .map(|guard| OwnedTranscriberGuard { guard })
    }
}

pub struct TranscriberGuard<'a> {
    guard: tokio::sync::MutexGuard<'a, InnerState>,
}

impl TranscriberGuard<'_> {
    pub fn context(&mut self) -> Result<&mut WhisperContext> {
        self.guard.context.as_mut().ok_or_else(|| anyhow!("no model loaded"))
    }
}

pub struct OwnedTranscriberGuard {
    guard: OwnedMutexGuard<InnerState>,
}

impl OwnedTranscriberGuard {
    pub fn context(&mut self) -> Result<&mut WhisperContext> {
        self.guard.context.as_mut().ok_or_else(|| anyhow!("no model loaded"))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    pub loaded: bool,
    pub model_name: String,
    pub model_path: String,
    pub version: String,
    pub commit: String,
}
