use std::ffi::OsString;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, Default)]
pub struct ReadOptions {
    pub enhance_audio: bool,
    pub verbose: bool,
}

/// ffmpeg was not found, or was found and could not be started. Not a problem with the
/// audio, so callers report it as such instead of "invalid audio file".
#[derive(Debug, thiserror::Error)]
pub enum FfmpegError {
    #[error("ffmpeg not found (looked in VIBE_SERVER_FFMPEG_PATH, next to vibe-server and on PATH)")]
    NotFound,
    #[error("ffmpeg could not be run ({path}): {source}")]
    Spawn { path: PathBuf, source: std::io::Error },
}

/// Decode the file at `path` to 16 kHz mono f32 samples. A WAV already in that format is
/// read directly; anything else goes through ffmpeg, which reads `path` itself, so the
/// original file is never loaded into memory.
pub fn read_file_with_options(path: impl AsRef<Path>, options: ReadOptions) -> anyhow::Result<Vec<f32>> {
    let path = path.as_ref();
    if !options.enhance_audio {
        // Buffered: the WAV reader pulls one sample at a time, and on a bare file that is a
        // system call per sample, tens of millions of them for an hour of audio.
        let mut file = std::io::BufReader::with_capacity(1 << 20, std::fs::File::open(path)?);
        if let Ok(samples) = try_read_native_wav(&mut file) {
            return Ok(samples);
        }
    }

    // A private temp file (0600 on Unix, random name), removed when `output` drops on any
    // path. Only the path is kept open so ffmpeg can write it on Windows too.
    let output = tempfile::Builder::new()
        .prefix("vibe-")
        .suffix(".wav")
        .tempfile()?
        .into_temp_path();
    convert_to_native_wav(path, &output, options)?;
    let mut reader = std::io::BufReader::with_capacity(1 << 20, std::fs::File::open(&output)?);
    try_read_native_wav(&mut reader)
}

pub fn convert_to_native_wav(
    input_path: impl AsRef<Path>,
    output_path: impl AsRef<Path>,
    options: ReadOptions,
) -> anyhow::Result<()> {
    convert_with(find_ffmpeg()?, input_path.as_ref(), output_path.as_ref(), options)
}

fn convert_with(ffmpeg: PathBuf, input_path: &Path, output_path: &Path, options: ReadOptions) -> anyhow::Result<()> {
    let mut args = vec!["-i".to_string(), input_path.to_string_lossy().into_owned()];

    // ffmpeg's default stream selection keeps one audio track, the one with the
    // most channels. A recording with a track per source (OBS, Discord) would lose
    // every other speaker, and the model, hearing silence where someone talks,
    // loops on a line it heard before. Mix them all when there is more than one;
    // a single track takes the same command as before.
    let tracks = count_audio_tracks(&ffmpeg, input_path);
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
        output_path.to_string_lossy().into_owned(),
    ]);

    let output = Command::new(&ffmpeg)
        .args(args)
        .output()
        .map_err(|source| FfmpegError::Spawn { path: ffmpeg, source })?;
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

/// Where ffmpeg is: the one the desktop app bundles and names in `VIBE_SERVER_FFMPEG_PATH`,
/// then the one next to this executable, then PATH. Only regular files count: a folder
/// named `ffmpeg` on PATH (Scoop's `apps\ffmpeg`) cannot be run.
fn find_ffmpeg() -> Result<PathBuf, FfmpegError> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    locate_ffmpeg(
        std::env::var_os("VIBE_SERVER_FFMPEG_PATH"),
        exe_dir.as_deref(),
        std::env::var_os("PATH"),
    )
    .ok_or(FfmpegError::NotFound)
}

const FFMPEG_NAME: &str = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

fn locate_ffmpeg(env_path: Option<OsString>, exe_dir: Option<&Path>, path_var: Option<OsString>) -> Option<PathBuf> {
    if let Some(path) = env_path.filter(|path| !path.is_empty()).map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
        eprintln!("warning: VIBE_SERVER_FFMPEG_PATH set to {path:?} but it is not a file, continuing search");
    }

    if let Some(candidate) = exe_dir.map(|dir| dir.join(FFMPEG_NAME)) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    find_in_path(&path_var?, FFMPEG_NAME)
}

/// The first regular file called `name` in an absolute PATH entry. Empty and relative
/// entries are skipped: they resolve against whatever the working directory happens to be.
fn find_in_path(paths: &std::ffi::OsStr, name: &str) -> Option<PathBuf> {
    std::env::split_paths(paths)
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
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

    fn touch(path: &Path) -> PathBuf {
        std::fs::write(path, b"").unwrap();
        path.to_path_buf()
    }

    fn path_var(dirs: &[&Path]) -> Option<OsString> {
        Some(std::env::join_paths(dirs).unwrap())
    }

    /// Scoop puts `scoop\apps\ffmpeg`, a folder, on PATH; running it fails with "Access is
    /// denied". The search must step over it to the real binary further along.
    #[test]
    fn a_directory_named_ffmpeg_on_path_is_skipped() {
        let root = tempfile::tempdir().unwrap();
        let apps = root.path().join("apps");
        std::fs::create_dir_all(apps.join(FFMPEG_NAME)).unwrap();
        let bin = root.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let real = touch(&bin.join(FFMPEG_NAME));
        assert_eq!(locate_ffmpeg(None, None, path_var(&[&apps, &bin])), Some(real));
        assert_eq!(locate_ffmpeg(None, None, path_var(&[&apps])), None);
    }

    #[test]
    fn the_env_var_wins_over_exe_dir_and_path() {
        let root = tempfile::tempdir().unwrap();
        let bundled = touch(&root.path().join("bundled-ffmpeg"));
        let exe_dir = root.path().join("exe");
        std::fs::create_dir(&exe_dir).unwrap();
        let beside = touch(&exe_dir.join(FFMPEG_NAME));
        let bin = root.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        touch(&bin.join(FFMPEG_NAME));
        let found = locate_ffmpeg(Some(bundled.clone().into()), Some(&exe_dir), path_var(&[&bin]));
        assert_eq!(found, Some(bundled));
        // Without the variable the binary next to the executable beats PATH.
        assert_eq!(locate_ffmpeg(None, Some(&exe_dir), path_var(&[&bin])), Some(beside));
    }

    #[test]
    fn an_env_var_that_is_not_a_file_is_ignored() {
        let root = tempfile::tempdir().unwrap();
        let bin = root.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let real = touch(&bin.join(FFMPEG_NAME));
        let folder = root.path().to_path_buf();
        assert_eq!(
            locate_ffmpeg(Some(folder.into()), None, path_var(&[&bin])),
            Some(real.clone())
        );
        let missing = root.path().join("missing");
        assert_eq!(
            locate_ffmpeg(Some(missing.into()), None, path_var(&[&bin])),
            Some(real.clone())
        );
        assert_eq!(locate_ffmpeg(Some(OsString::new()), None, path_var(&[&bin])), Some(real));
    }

    #[test]
    fn relative_path_entries_are_skipped() {
        let root = tempfile::tempdir().unwrap();
        let relative = PathBuf::from("vibe-test-relative-bin");
        assert_eq!(find_in_path(&std::env::join_paths([&relative]).unwrap(), FFMPEG_NAME), None);
        let bin = root.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let real = touch(&bin.join(FFMPEG_NAME));
        let paths = std::env::join_paths([Path::new(""), relative.as_path(), bin.as_path()]).unwrap();
        assert_eq!(find_in_path(&paths, FFMPEG_NAME), Some(real));
    }

    /// A file the native reader takes is read without ffmpeg; anything else is converted
    /// from its own path.
    #[test]
    fn native_wav_is_read_without_ffmpeg() {
        let samples = read_file_with_options(fixture("single.wav"), ReadOptions::default()).unwrap();
        assert!(!samples.is_empty());
    }

    /// An ffmpeg that cannot be started (here a directory) is reported as that, with the
    /// path, not as a problem with the audio.
    #[test]
    fn an_unrunnable_ffmpeg_is_named_in_the_error() {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("out.wav");
        let err = convert_with(
            root.path().to_path_buf(),
            &fixture("short.mp4"),
            &output,
            ReadOptions::default(),
        )
        .unwrap_err();
        let ffmpeg = err.downcast_ref::<FfmpegError>().expect("an FfmpegError");
        assert!(matches!(ffmpeg, FfmpegError::Spawn { .. }));
        let message = err.to_string();
        assert!(message.starts_with("ffmpeg could not be run ("), "{message}");
        assert!(message.contains(&root.path().display().to_string()), "{message}");
    }
}
