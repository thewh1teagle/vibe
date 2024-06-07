use eyre::{bail, Context, Result};
use hound::{SampleFormat, WavReader};
use std::process::Stdio;
use std::{path::PathBuf, process::Command};

pub fn normalize(input: PathBuf, output: PathBuf, seek: String) -> Result<()> {
    let mut pid = Command::new("ffmpeg")
        .args([
            "-i",
            input.to_str().unwrap(),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            (output.to_str().unwrap()),
            "-hide_banner",
            "-y",
            "-loglevel",
            "error",
        ])
        .stdin(Stdio::null())
        .spawn()?;
    if !pid.wait()?.success() {
        bail!("unable to convert file")
    }
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
/// ffmpeg -i short.wav -i single.wav -filter_complex amix=inputs=2:duration=shortest -ac 2 merged.wav
fn merge_wav_files(a: PathBuf, b: PathBuf, dst: PathBuf) -> Result<()> {
    let output = dst.to_str().unwrap();
    let mut pid = Command::new("ffmpeg")
        .args(&[
            "-i",
            a.to_str().unwrap(),
            "-i",
            b.to_str().unwrap(),
            "-filter_complex",
            "amix=inputs=2:duration=shortest",
            "-ac",
            "2",
            output,
            "-hide_banner",
            "-y",
            "-loglevel",
            "error",
        ])
        .stdin(Stdio::null())
        .spawn()?;

    if !pid.wait()?.success() {
        bail!("unable to merge files");
    }
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
