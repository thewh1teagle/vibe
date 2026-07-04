use std::path::Path;

use crate::{
    ContextOptions, Error, GPUDeviceType::*, Result, StreamCallbacks, TranscribeOptions,
    TranscribeResult,
};

#[derive(Debug)]
pub struct Context;

impl Context {
    pub fn new(_model_path: impl AsRef<Path>, _options: ContextOptions) -> Result<Self> {
        Err(Error::FfiDisabled)
    }

    pub fn transcribe(
        &mut self,
        _samples: &[f32],
        _options: TranscribeOptions,
    ) -> Result<TranscribeResult> {
        Err(Error::FfiDisabled)
    }

    pub fn transcribe_stream(
        &mut self,
        _samples: &[f32],
        _options: TranscribeOptions,
        _callbacks: StreamCallbacks<'_>,
    ) -> Result<TranscribeResult> {
        Err(Error::FfiDisabled)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GPUDevice {
    pub index: i32,
    pub name: String,
    pub description: String,
    pub device_type: GPUDeviceType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GPUDeviceType {
    Gpu,
    IntegratedGpu,
}

pub fn list_gpu_devices() -> Vec<GPUDevice> {
    let _ = (Gpu, IntegratedGpu);
    Vec::new()
}

pub fn set_verbose(_verbose: bool) {}
