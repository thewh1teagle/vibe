use std::io::{Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, Default)]
pub struct ReadOptions {
    pub enhance_audio: bool,
    pub verbose: bool,
}

pub fn read_file_with_options(path: impl AsRef<Path>, options: ReadOptions) -> anyhow::Result<Vec<f32>> {
    let mut file = std::fs::File::open(path)?;
    read_with_options(&mut file, options)
}

pub fn read_bytes_with_options(bytes: Vec<u8>, options: ReadOptions) -> anyhow::Result<Vec<f32>> {
    let mut cursor = Cursor::new(bytes);
    read_with_options(&mut cursor, options)
}

pub fn read_with_options<R: Read + Seek>(reader: &mut R, options: ReadOptions) -> anyhow::Result<Vec<f32>> {
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
    let mut args = vec!["-i".to_string(), input_path.as_ref().to_string_lossy().into_owned()];

    // ffmpeg's default stream selection keeps one audio track, the one with the
    // most channels. A recording with a track per source (OBS, Discord) would lose
    // every other speaker, and the model, hearing silence where someone talks,
    // loops on a line it heard before. Mix them all when there is more than one;
    // a single track takes the same command as before.
    let tracks = count_audio_tracks(&ffmpeg, input_path.as_ref());
    let enhance = "silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-45dB";
    if tracks > 1 {
        if options.verbose {
            eprintln!("mixing {tracks} audio tracks");
        }
        let inputs: String = (0..tracks).map(|i| format!("[0:a:{i}]")).collect();
        // normalize=0: one source per track means one voice at a time, and the
        // default would divide the loudness by the track count. duration=longest:
        // a track that ends early must not cut the mix short.
        let mut graph = format!("{inputs}amix=inputs={tracks}:duration=longest:normalize=0[mix]");
        if options.enhance_audio {
            graph.push_str(&format!(";[mix]{enhance}[out]"));
            args.extend(["-filter_complex".to_string(), graph, "-map".to_string(), "[out]".to_string()]);
        } else {
            args.extend(["-filter_complex".to_string(), graph, "-map".to_string(), "[mix]".to_string()]);
        }
    } else if options.enhance_audio {
        args.extend(["-af".to_string(), enhance.to_string()]);
    }
    args.extend(["-ar".to_string(), "16000".to_string(), "-ac".to_string(), "1".to_string()]);
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

/// How many audio streams the container holds. `ffmpeg -i` without an output
/// exits non-zero but lists every stream on stderr; anything that goes wrong
/// counts as one, which is the command that always worked.
fn count_audio_tracks(ffmpeg: &Path, input: &Path) -> usize {
    let Ok(output) = Command::new(ffmpeg).args(["-hide_banner", "-i"]).arg(input).output() else {
        return 1;
    };
    let count = String::from_utf8_lossy(&output.stderr)
        .lines()
        .filter(|line| line.trim_start().starts_with("Stream #") && line.contains("Audio:"))
        .count();
    count.max(1)
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

    if let Ok(path) = std::env::var("VIBE_SERVER_FFMPEG_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
        eprintln!(
            "warning: VIBE_SERVER_FFMPEG_PATH set to {:?} but not found, continuing search",
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures").join(name)
    }

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    /// two-tracks.mp4 is multi.wav split in two: track 0 carries the first 24 s and
    /// then silence, track 1 silence and then the rest. ffmpeg's default selection
    /// keeps only track 0, so the last quarter used to come out silent.
    #[test]
    fn every_track_is_heard() {
        if find_ffmpeg().is_err() {
            eprintln!("skipping: ffmpeg not found");
            return;
        }
        assert_eq!(count_audio_tracks(&find_ffmpeg().unwrap(), &fixture("two-tracks.mp4")), 2);
        assert_eq!(count_audio_tracks(&find_ffmpeg().unwrap(), &fixture("short.mp4")), 1);
        let mixed = read_file_with_options(fixture("two-tracks.mp4"), ReadOptions::default()).unwrap();
        let whole = read_file_with_options(fixture("multi.wav"), ReadOptions::default()).unwrap();
        let quarter = mixed.len() / 4;
        assert!(rms(&mixed[..quarter]) > 0.01, "first quarter is silent");
        assert!(
            rms(&mixed[mixed.len() - quarter..]) > 0.01,
            "last quarter is silent: the second track was dropped"
        );
        let drift = (mixed.len() as f32 - whole.len() as f32).abs() / whole.len() as f32;
        assert!(drift < 0.02, "mix is {} samples, source {}", mixed.len(), whole.len());
    }

    /// The silence trim still applies on top of a mix.
    #[test]
    fn enhance_audio_runs_after_the_mix() {
        if find_ffmpeg().is_err() {
            return;
        }
        let plain = read_file_with_options(fixture("two-tracks.mp4"), ReadOptions::default()).unwrap();
        let trimmed = read_file_with_options(
            fixture("two-tracks.mp4"),
            ReadOptions {
                enhance_audio: true,
                verbose: false,
            },
        )
        .unwrap();
        assert!(trimmed.len() < plain.len(), "silenceremove had no effect on the mix");
    }
}
