use core_graphics_helmer_fork::access::ScreenCaptureAccess;
use eyre::{bail, eyre, Context, ContextCompat, Result};
use objc_id::Id;
use screencapturekit_sys::os_types::base::BOOL;
use screencapturekit_sys::{
    cm_sample_buffer_ref::CMSampleBufferRef, content_filter::UnsafeContentFilter, content_filter::UnsafeInitParams,
    shareable_content::UnsafeSCShareableContent, stream::UnsafeSCStream, stream_configuration::UnsafeStreamConfiguration,
    stream_error_handler::UnsafeSCStreamError, stream_output_handler::UnsafeSCStreamOutput,
};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::ops::Deref;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::utils::LogError;

const MAX_CHANNELS: usize = 2;

struct StoreAudioHandler {}
struct ErrorHandler;

impl UnsafeSCStreamError for ErrorHandler {
    fn handle_error(&self) {
        tracing::error!("ERROR in SCStream");
    }
}

impl UnsafeSCStreamOutput for StoreAudioHandler {
    fn did_output_sample_buffer(&self, sample: Id<CMSampleBufferRef>, _of_type: u8) {
        let audio_buffers = sample.get_av_audio_buffer_list();

        let base_path = get_vibe_temp_folder();

        for (i, buffer) in audio_buffers.into_iter().enumerate() {
            if i > MAX_CHANNELS {
                tracing::warn!("Audio recording with screen capture: more than two channels detected, only storing first two");
                break; // max two channels for now
            }
            let result = OpenOptions::new()
                .create(true)
                .append(true) // Use append mode
                .open(base_path.join(PathBuf::from(format!("output{}.raw", i))))
                .context("failed to open file")
                .log_error();

            if let Some(mut file) = result {
                if let Err(e) = file.write_all(buffer.data.deref()) {
                    tracing::error!("failed to write SCStream buffer to file: {:?}", e);
                }
            }
        }
    }
}

pub fn reset_screen_permissions() -> Result<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("tccutil")
        .arg("reset")
        .arg("ScreenCapture")
        .arg("github.com.thewh1teagle.vibe")
        .spawn()
        .context("failed to reset screen permissions")?
        .wait()?;
    Ok(())
}

pub fn has_permission() -> bool {
    ScreenCaptureAccess.preflight()
}

pub fn init() -> Result<Id<UnsafeSCStream>> {
    if !has_permission() {
        reset_screen_permissions()?;
    }
    // Don't record the screen
    let display = UnsafeSCShareableContent::get()
        .map_err(|e| eyre!("{:?}", e))?
        .displays()
        .into_iter()
        .next()
        .context("next")?;
    let width = display.get_width();
    let height = display.get_height();
    let filter = UnsafeContentFilter::init(UnsafeInitParams::Display(display));

    let config = UnsafeStreamConfiguration {
        width,
        height,
        captures_audio: BOOL::from(true),
        excludes_current_process_audio: BOOL::from(true),
        ..Default::default()
    };

    let stream = UnsafeSCStream::init(filter, config.into(), ErrorHandler);
    stream.add_stream_output(StoreAudioHandler {}, 1);
    Ok(stream)
}

pub fn start_capture(stream: &Id<UnsafeSCStream>) -> Result<()> {
    let base_path = get_vibe_temp_folder();
    for i in 0..MAX_CHANNELS {
        let output_path = base_path.join(format!("output{}.raw", i));
        if output_path.exists() {
            fs::remove_file(output_path)?;
        }
    }
    stream.start_capture().map_err(|e| eyre!("Failed to start capture {}", e))?;
    Ok(())
}

pub fn stop_capture(stream: &Id<UnsafeSCStream>) -> Result<()> {
    stream.stop_capture().map_err(|e| eyre!("Failed to stop capture {}", e))?;
    Ok(())
}

#[allow(dead_code)]
pub fn pause_capture(stream: &Id<UnsafeSCStream>) -> Result<()> {
    stream.start_capture().map_err(|e| eyre!("{}", e))?;
    Ok(())
}

#[allow(dead_code)]
pub fn resume_capture(stream: &Id<UnsafeSCStream>) -> Result<()> {
    stream.stop_capture().map_err(|e| eyre!("{:?}", e))?;
    Ok(())
}
