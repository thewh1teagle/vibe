use crate::audio_utils::get_vibe_temp_folder;
use core_graphics_helmer_fork::access::ScreenCaptureAccess;
use eyre::{eyre, Context, ContextCompat, Result};
use objc_id::Id;
use screencapturekit_sys::os_types::base::BOOL;
use screencapturekit_sys::{
    cm_sample_buffer_ref::CMSampleBufferRef, content_filter::UnsafeContentFilter, content_filter::UnsafeInitParams,
    shareable_content::UnsafeSCShareableContent, stream::UnsafeSCStream, stream_configuration::UnsafeStreamConfiguration,
    stream_error_handler::UnsafeSCStreamError, stream_output_handler::UnsafeSCStreamOutput,
};
use std::fs;
use std::sync::{Arc, Mutex};

const MAX_CHANNELS: usize = 2;

struct StoreAudioHandler {
    wav_writer: Arc<Mutex<Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>>>,
}
struct ErrorHandler;

impl UnsafeSCStreamError for ErrorHandler {
    fn handle_error(&self) {
        tracing::error!("ERROR in SCStream");
    }
}

fn f32_to_i16(sample: f32) -> i16 {
    // match ffmpeg’s typical float->s16 mapping with clipping
    // f32 expected in [-1.0, 1.0). Use 32767.0 scale and saturate.
    if sample.is_nan() {
        0
    } else {
        let s = (sample * 32767.0).round();
        s.clamp(i16::MIN as f32, i16::MAX as f32) as i16
    }
}

impl UnsafeSCStreamOutput for StoreAudioHandler {
    fn did_output_sample_buffer(&self, sample: Id<CMSampleBufferRef>, _of_type: u8) {
        let audio_buffers = sample.get_av_audio_buffer_list();
        let left_f32: &[f32] = match bytemuck::try_cast_slice(audio_buffers[0].data.as_slice()) {
            Ok(data) => data,
            Err(_) => {
                tracing::error!("left buffer is not valid f32le data");
                return;
            }
        };

        let right_f32: &[f32] = match bytemuck::try_cast_slice(audio_buffers[1].data.as_slice()) {
            Ok(data) => data,
            Err(_) => {
                tracing::error!("right buffer is not valid f32le data");
                return;
            }
        };

        if left_f32.len() != right_f32.len() {
            tracing::error!("left and right buffer lengths do not match");
            return;
        }

        if let Ok(mut guard) = self.wav_writer.lock() {
            if let Some(writer) = guard.as_mut() {
                for i in 0..left_f32.len() {
                    let l = f32_to_i16(left_f32[i]);
                    let r = f32_to_i16(right_f32[i]);
                    if let Err(e) = writer.write_sample(l) {
                        tracing::error!("failed to write left sample to wav: {:?}", e);
                    }
                    if let Err(e) = writer.write_sample(r) {
                        tracing::error!("failed to write right sample to wav: {:?}", e);
                    }
                }
            }
        } else {
            tracing::error!("failed to lock wav writer mutex");
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

pub fn init(wav_writer: Arc<Mutex<Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>>>) -> Result<Id<UnsafeSCStream>> {
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
        sample_rate: 48000,
        channel_count: MAX_CHANNELS as u32,
        ..Default::default()
    };

    let stream = UnsafeSCStream::init(filter, config.into(), ErrorHandler);
    stream.add_stream_output(StoreAudioHandler { wav_writer }, 1);
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
