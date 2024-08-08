use eyre::{bail, Context, ContextCompat, Result};
use hound::{SampleFormat, WavReader};
use std::process::Stdio;
use std::{path::PathBuf, process::Command};
use which::which;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "ffmpeg";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "ffmpeg.exe";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn find_ffmpeg_path() -> Option<PathBuf> {
    // Check if `ffmpeg` is in the PATH environment variable using the `which` crate
    if let Ok(path) = which(EXECUTABLE_NAME) {
        return Some(path);
    }

    // Check in current working directory
    let cwd = std::env::current_dir().ok()?;
    let ffmpeg_in_cwd = cwd.join(EXECUTABLE_NAME);
    if ffmpeg_in_cwd.is_file() && ffmpeg_in_cwd.exists() {
        return Some(ffmpeg_in_cwd);
    }

    // Check in the same folder as the executable
    if let Ok(exe_path) = std::env::current_exe() {
        let exe_folder = exe_path.parent()?;
        let ffmpeg_in_exe_folder = exe_folder.join(EXECUTABLE_NAME);
        if ffmpeg_in_exe_folder.exists() {
            return Some(ffmpeg_in_exe_folder);
        }
        // For macOS, check in the Resources folder next to the executable
        #[cfg(target_os = "macos")]
        {
            let resources_folder = exe_folder.join("../Resources");
            let ffmpeg_in_resources = resources_folder.join(EXECUTABLE_NAME);
            if ffmpeg_in_resources.exists() {
                return Some(ffmpeg_in_resources);
            }
        }
    }

    None
}

pub fn normalize(input: PathBuf, output: PathBuf) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    tracing::debug!("ffmpeg path is {}", ffmpeg_path.display());

    let mut cmd = Command::new(ffmpeg_path);
    let cmd = cmd.args([
        "-i",
        input.to_str().context("tostr")?,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        output.to_str().context("tostr")?,
        "-hide_banner",
        "-y",
        "-loglevel",
        "error",
    ]);

    let cmd = cmd.stdin(Stdio::null());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        bail!("unable to convert file")
    }

    if !output.exists() {
        bail!("seems like ffmpeg failed for some reason. output not exists")
    }
    Ok(())
}

pub fn parse_wav_file(path: &PathBuf) -> Result<Vec<i16>> {
    tracing::debug!("wav reader read from {:?}", path);
    let reader = WavReader::open(path).context("failed to read file")?;
    tracing::debug!("parsing {}", path.display());

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
pub fn merge_wav_files(a: PathBuf, b: PathBuf, dst: PathBuf) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    let output = dst.to_str().context("tostr")?;

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-i",
        a.to_str().context("tostr")?,
        "-i",
        b.to_str().context("tostr")?,
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
    .stdin(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        bail!("unable to merge files");
    }
    Ok(())
}
