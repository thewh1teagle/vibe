use chrono::Local;
use eyre::{bail, ContextCompat, Result};
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use which::which;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "ffmpeg";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "ffmpeg.exe";

pub fn get_local_time() -> String {
    let now = Local::now();
    now.format("%Y-%m-%d %H-%M-%S").to_string()
}

pub fn random_string(length: usize) -> String {
    use rand::distr::Alphanumeric;
    use rand::Rng;
    rand::rng().sample_iter(&Alphanumeric).take(length).map(char::from).collect()
}

static VIBE_TEMP_FOLDER: OnceLock<PathBuf> = OnceLock::new();

pub fn get_vibe_temp_folder() -> &'static PathBuf {
    VIBE_TEMP_FOLDER.get_or_init(|| {
        let current_datetime = Local::now();
        let formatted_datetime = current_datetime.format("%Y-%m-%d").to_string();
        let dir = std::env::temp_dir().join(format!("vibe_temp_{}", formatted_datetime));
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
        std::env::temp_dir()
    })
}

pub fn find_ffmpeg_path() -> Option<PathBuf> {
    if let Ok(path) = which(EXECUTABLE_NAME) {
        return Some(path);
    }

    let cwd = std::env::current_dir().ok()?;
    let ffmpeg_in_cwd = cwd.join(EXECUTABLE_NAME);
    if ffmpeg_in_cwd.is_file() {
        return Some(ffmpeg_in_cwd);
    }

    if let Ok(exe_path) = std::env::current_exe() {
        let exe_folder = exe_path.parent()?;
        let ffmpeg_in_exe_folder = exe_folder.join(EXECUTABLE_NAME);
        if ffmpeg_in_exe_folder.exists() {
            return Some(ffmpeg_in_exe_folder);
        }
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

/// Re-encode audio for transcription: 16 kHz mono PCM s16le WAV.
/// Whisper models require this format for accurate transcription.
pub fn normalize(input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    tracing::debug!("ffmpeg path is {}", ffmpeg_path.display());

    let mut cmd = Command::new(ffmpeg_path);
    let cmd = cmd.stderr(Stdio::piped()).args([
        "-i",
        input.to_str().context("failed to convert input path to UTF-8")?,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
    ]);

    cmd.args(additional_ffmpeg_args.unwrap_or_default());

    cmd.args([
        output.to_str().context("failed to convert output path to UTF-8")?,
        "-hide_banner",
        "-y",
        "-loglevel",
        "error",
    ]);

    tracing::debug!("cmd: {:?}", cmd);

    let cmd = cmd.stdin(Stdio::null());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(crate::config::CREATE_NO_WINDOW);

    let mut child = cmd.spawn()?;
    if !child.wait()?.success() {
        let mut stderr_output = String::new();
        if let Some(ref mut stderr) = child.stderr {
            stderr.take(4096).read_to_string(&mut stderr_output)?;
        }
        bail!("unable to convert file: {:?} args: {:?}", stderr_output, cmd.get_args());
    }

    if !output.exists() {
        bail!("seems like ffmpeg failed for some reason. output not exists")
    }
    Ok(())
}

pub fn merge_wav_files(a: PathBuf, b: PathBuf, dst: PathBuf) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    let output = dst.to_str().context("tostr")?;

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-i",
        a.to_str().context("failed to convert first input path to UTF-8")?,
        "-i",
        b.to_str().context("failed to convert second input path to UTF-8")?,
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
    cmd.creation_flags(crate::config::CREATE_NO_WINDOW);

    let mut child = cmd.spawn()?;
    if !child.wait()?.success() {
        bail!("unable to merge files");
    }
    Ok(())
}
