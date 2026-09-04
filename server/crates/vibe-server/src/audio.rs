use std::io::{Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, Default)]
pub struct ReadOptions {
    pub enhance_audio: bool,
    pub verbose: bool,
}

pub fn read_file_with_options(
    path: impl AsRef<Path>,
    options: ReadOptions,
) -> anyhow::Result<Vec<f32>> {
    let mut file = std::fs::File::open(path)?;
    read_with_options(&mut file, options)
}

pub fn read_bytes_with_options(bytes: Vec<u8>, options: ReadOptions) -> anyhow::Result<Vec<f32>> {
    let mut cursor = Cursor::new(bytes);
    read_with_options(&mut cursor, options)
}

pub fn read_with_options<R: Read + Seek>(
    reader: &mut R,
    options: ReadOptions,
) -> anyhow::Result<Vec<f32>> {
    if !options.enhance_audio {
        if let Ok(samples) = try_read_native_wav(reader) {
            return Ok(samples);
        }
    }

    reader.seek(SeekFrom::Start(0))?;
    let mut input = tempfile::NamedTempFile::new()?;
    std::io::copy(reader, &mut input)?;
    input.flush()?;

    let output_path = PathBuf::from(format!("{}.wav", input.path().display()));
    convert_to_native_wav(input.path(), &output_path, options)?;
    let mut output = std::fs::File::open(&output_path)?;
    let samples = try_read_native_wav(&mut output)?;
    let _ = std::fs::remove_file(output_path);
    Ok(samples)
}

pub fn convert_to_native_wav(
    input_path: impl AsRef<Path>,
    output_path: impl AsRef<Path>,
    options: ReadOptions,
) -> anyhow::Result<()> {
    let ffmpeg = find_ffmpeg()?;
    let mut args = vec![
        "-i".to_string(),
        input_path.as_ref().to_string_lossy().into_owned(),
        "-ar".to_string(),
        "16000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
    ];
    if options.enhance_audio {
        args.push("-af".to_string());
        args.push("silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-45dB".to_string());
    }
    args.extend([
        "-acodec".to_string(),
        "pcm_s16le".to_string(),
        "-y".to_string(),
        output_path.as_ref().to_string_lossy().into_owned(),
    ]);

    let output = Command::new(ffmpeg).args(args).output()?;
    if !output.status.success() {
        let mut stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        if stderr.len() > 500 {
            stderr.truncate(500);
            stderr.push_str("...");
        }
        anyhow::bail!("ffmpeg WAV conversion failed: {stderr}");
    }
    if options.verbose && !output.stderr.is_empty() {
        eprint!("{}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(())
}

fn try_read_native_wav<R: Read + Seek>(reader: &mut R) -> anyhow::Result<Vec<f32>> {
    reader.seek(SeekFrom::Start(0))?;
    let mut wav = hound::WavReader::new(reader)?;
    let spec = wav.spec();
    if spec.sample_rate != 16_000
        || spec.channels != 1
        || spec.bits_per_sample != 16
        || spec.sample_format != hound::SampleFormat::Int
    {
        anyhow::bail!("not a native 16kHz mono 16-bit PCM WAV");
    }

    let samples = wav
        .samples::<i16>()
        .map(|sample| sample.map(|sample| sample as f32 / 32768.0))
        .collect::<Result<Vec<_>, _>>()?;
    if samples.is_empty() {
        anyhow::bail!("audio file contains no samples");
    }
    Ok(samples)
}

fn find_ffmpeg() -> anyhow::Result<PathBuf> {
    if let Some(path) = find_in_path("ffmpeg") {
        return Ok(path);
    }

    if let Ok(path) = std::env::var("SONA_FFMPEG_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
        eprintln!(
            "warning: SONA_FFMPEG_PATH set to {:?} but not found, continuing search",
            path
        );
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["ffmpeg", "ffmpeg.exe"] {
                let candidate = dir.join(name);
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    anyhow::bail!("ffmpeg not found")
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|path| path.join(name))
        .find(|path| path.exists())
}

