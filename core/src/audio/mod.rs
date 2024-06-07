use eyre::{bail, Context, Result};
use ffmpeg_next::Rescale;
use hound::{SampleFormat, WavReader};
use std::path::PathBuf;
mod encoder;

pub fn normalize(input: PathBuf, output: PathBuf, seek: String) -> Result<()> {
    ffmpeg_next::init()?;

    let filter = "anull";
    let seek = seek.parse::<i64>().ok();

    log::debug!("input is {} and output is {}", input.display(), output.display());
    let mut ictx = ffmpeg_next::format::input(&input)?;
    let mut octx = ffmpeg_next::format::output(&output)?;
    let mut transcoder = encoder::transcoder(&mut ictx, &mut octx, &output, filter)?;

    if let Some(position) = seek {
        // If the position was given in seconds, rescale it to ffmpegs base timebase.
        let position = position.rescale((1, 1), ffmpeg_next::rescale::TIME_BASE);
        // If this seek was embedded in the transcoding loop, a call of `flush()`
        // for every opened buffer after the successful seek would be advisable.
        ictx.seek(position, ..position)?;
    }

    octx.set_metadata(ictx.metadata().to_owned());
    octx.write_header()?;

    for (stream, mut packet) in ictx.packets() {
        if stream.index() == transcoder.stream {
            packet.rescale_ts(stream.time_base(), transcoder.in_time_base);
            transcoder.send_packet_to_decoder(&packet)?;
            transcoder.receive_and_process_decoded_frames(&mut octx)?;
        }
    }

    transcoder.send_eof_to_decoder()?;
    transcoder.receive_and_process_decoded_frames(&mut octx)?;

    transcoder.flush_filter()?;
    transcoder.get_and_process_filtered_frames(&mut octx)?;

    transcoder.send_eof_to_encoder()?;
    transcoder.receive_and_process_encoded_packets(&mut octx)?;

    octx.write_trailer()?;
    Ok(())
}

pub fn parse_wav_file(path: &PathBuf) -> Result<Vec<i16>> {
    log::debug!("wav reader read from {:?}", path);
    let reader = WavReader::open(path).context("failed to read file")?;
    log::debug!("parsing {}", path.display());

    let channels = reader.spec().channels;
    if reader.spec().channels != 1 {
        bail!("expected mono audio file and found {} channels!", channels);
    }
    if reader.spec().sample_format != SampleFormat::Int {
        bail!("expected integer sample format");
    }
    if reader.spec().sample_rate != 16000 {
        bail!("expected 16KHz sample rate");
    }
    if reader.spec().bits_per_sample != 16 {
        bail!("expected 16 bits per sample");
    }

    reader.into_samples::<i16>().map(|x| x.context("sample")).collect()
}

/// Merge audio files, taking to shortest one and merge the others
/// Same as doing
/// ffmpeg -i short.wav -i single.wav -filter_complex amix=inputs=2:duration=shortest -ac 2 merged.wav
pub fn merge_wav_files(a: PathBuf, b: PathBuf, dst: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use eyre::Result;
    use std::fs;
    use tempfile::tempdir;

    use crate::audio;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    #[test]
    fn test_audio_conversion() -> Result<()> {
        init();
        log::debug!("test");
        // Create a temporary directory to store input and output files.
        let temp_dir = tempdir()?;
        let input_file_path = temp_dir.path().join("input.mp3");
        let output_file_path = temp_dir.path().join("output.wav");

        // Copy a sample input file to the temporary directory.
        log::debug!("copying from {} to {}", "src/audio/test_audio.wav", input_file_path.display());
        fs::copy("src/audio/test_audio.wav", &input_file_path)?;
        audio::normalize(input_file_path, output_file_path.clone(), "0".to_owned())?;
        log::debug!("check output at {}", output_file_path.display());

        Ok(())
    }
}
