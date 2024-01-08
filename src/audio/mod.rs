use anyhow::Result;
use ffmpeg_next as ffmpeg;
use std::path::PathBuf;
mod encoder;
pub struct Audio {}

impl Audio {
    pub fn try_create() -> Result<Self> {
        Ok(Audio {})
    }

    pub fn convert(&self, input: PathBuf, output: PathBuf) -> Result<()> {
        encoder::convert_to_16khz(input, output, None, None)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use log::debug;
    use std::fs;
    use tempfile::tempdir;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    fn wait_for_enter() -> Result<()> {
        println!("PRESS ENTER");
        let mut buffer = String::new();
        std::io::stdin().read_line(&mut buffer)?;
        Ok(())
    }

    #[test]
    fn test_audio_conversion() -> Result<()> {
        init();
        debug!("test");
        // Create a temporary directory to store input and output files.
        let temp_dir = tempdir()?;
        let input_file_path = temp_dir.path().join("input.mp3");
        let output_file_path = temp_dir.path().join("output.wav");

        // Copy a sample input file to the temporary directory.
        debug!("copying from {} to {}", "src/audio/test_audio.wav", input_file_path.display());
        fs::copy("src/audio/test_audio.wav", &input_file_path)?;
        wait_for_enter();
        let mut audio = Audio::try_create()?;
        audio.convert(input_file_path, output_file_path.clone())?;
        debug!("check output at {}", output_file_path.display());
        wait_for_enter();

        Ok(())
    }
}
