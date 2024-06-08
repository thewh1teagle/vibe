use eyre::{bail, Result};
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
use vibe::audio::find_ffmpeg_path;

const MAX_CHANNELS: usize = 2;

struct StoreAudioHandler {}
struct ErrorHandler;

impl UnsafeSCStreamError for ErrorHandler {
    fn handle_error(&self) {
        log::error!("ERROR in SCStream");
    }
}

impl UnsafeSCStreamOutput for StoreAudioHandler {
    fn did_output_sample_buffer(&self, sample: Id<CMSampleBufferRef>, _of_type: u8) {
        let audio_buffers = sample.get_av_audio_buffer_list();

        let base_path = std::env::temp_dir();

        for (i, buffer) in audio_buffers.into_iter().enumerate() {
            if i > MAX_CHANNELS {
                log::warn!("Audio recording with screen capture: more than two channels detected, only storing first two");
                break; // max two channels for now
            }
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .append(true) // Use append mode
                .open(base_path.join(PathBuf::from(format!("output{}.raw", i))))
                .expect("failed to open file");
            if let Err(e) = file.write_all(buffer.data.deref()) {
                log::error!("failed to write SCStream buffer to file: {:?}", e);
            }
        }
    }
}

pub fn init() -> Id<UnsafeSCStream> {
    // Don't record the screen
    let display = UnsafeSCShareableContent::get()
        .unwrap()
        .displays()
        .into_iter()
        .next()
        .unwrap();
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
    stream
}

pub fn start_capture(stream: &Id<UnsafeSCStream>) {
    let base_path = std::env::temp_dir();
    for i in 0..MAX_CHANNELS {
        let output_path = base_path.join(format!("output{}.raw", i));
        if output_path.exists() {
            fs::remove_file(output_path).unwrap();
        }
    }
    stream.start_capture().expect("Failed to start capture");
}

pub fn stop_capture(stream: &Id<UnsafeSCStream>) {
    stream.stop_capture().expect("Failed to stop capture");
}

#[allow(dead_code)]
pub fn pause_capture(stream: &Id<UnsafeSCStream>) {
    stream.start_capture().expect("Failed to pause capture");
}

#[allow(dead_code)]
pub fn resume_capture(stream: &Id<UnsafeSCStream>) {
    stream.stop_capture().expect("Failed to resume capture");
}

pub fn screencapturekit_to_wav(output_path: PathBuf) -> Result<()> {
    // TODO: convert to wav
    // ffmpeg -f f32le -ar 48000 -ac 1 -i output0.raw -f f32le -ar 48000 -ac 1 -i output1.raw -filter_complex "[0:a][1:a]amerge=inputs=2" -ac 2 output.wav
    let base_path = std::env::temp_dir();
    let output_0 = base_path.join(format!("output{}.raw", 0));
    let output_1 = base_path.join(format!("output{}.raw", 1));
    let mut pid = Command::new(find_ffmpeg_path().unwrap())
        .args([
            "-y",
            "-f",
            "f32le",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-i",
            &output_0.to_string_lossy(),
            "-f",
            "f32le",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-i",
            &output_1.to_string_lossy(),
            "-filter_complex",
            "[0:a][1:a]amerge=inputs=2",
            "-ac",
            "2",
            &output_path.to_str().unwrap(),
            "-hide_banner",
            "-y",
            "-loglevel",
            "error",
        ])
        .stdin(Stdio::null())
        .spawn()
        .expect("failed to execute process");
    if !pid.wait().unwrap().success() {
        bail!("unable to convert file")
    }
    log::info!("COMPLETED - {}", output_path.display());
    Ok(())
}
