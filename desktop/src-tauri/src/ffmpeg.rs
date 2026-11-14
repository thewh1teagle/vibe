use chrono::Local;
use eyre::{bail, ContextCompat, Result};
use rand::distr::Alphanumeric;
use rand::Rng;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use which::which;

pub fn get_local_time() -> String {
    let now = Local::now();
    now.format("%Y-%m-%d %H-%M-%S").to_string()
}

pub fn random_string(length: usize) -> String {
    rand::rng().sample_iter(&Alphanumeric).take(length).map(char::from).collect()
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "ffmpeg";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "ffmpeg.exe";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// The app's own scratch folder: recordings, converted audio, downloads and the sidecar's temp
/// copies land here. Resolved once per process by [`init_staging_dir`] (or the fallback) and
/// re-checked on every call, since the folder can be removed while the app runs.
static STAGING_DIR: OnceLock<PathBuf> = OnceLock::new();
/// Used only when the staging folder cannot be made private; unique per process.
static EMERGENCY_DIR: OnceLock<PathBuf> = OnceLock::new();

const STAGING_FOLDER_NAME: &str = "staging";
/// Matches `identifier` in tauri.conf.json, so the fallback lands where `app_cache_dir` does.
const APP_IDENTIFIER: &str = "github.com.thewh1teagle.vibe";
/// Set once the folder passed the full check; later calls only confirm it is still a directory.
static STAGING_VERIFIED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Resolve the staging folder under the app cache dir. Call once, early in setup, before
/// anything reads [`get_vibe_temp_folder`].
pub fn init_staging_dir(app: &tauri::AppHandle) {
    use tauri::Manager;
    let dir = match app.path().app_cache_dir() {
        Ok(cache) => cache.join(STAGING_FOLDER_NAME),
        Err(error) => {
            tracing::error!("no app cache dir, using the fallback staging folder: {error}");
            fallback_staging_dir()
        }
    };
    if STAGING_DIR.set(dir.clone()).is_err() && STAGING_DIR.get() != Some(&dir) {
        tracing::warn!(
            "staging folder was used before it was initialised; keeping {:?}",
            STAGING_DIR.get()
        );
    }
}

/// Where temp files go. Keeps its historical name and signature; callers have no AppHandle.
pub fn get_vibe_temp_folder() -> PathBuf {
    use std::sync::atomic::Ordering;
    let dir = STAGING_DIR.get_or_init(fallback_staging_dir);
    let still_there = || std::fs::symlink_metadata(dir).is_ok_and(|metadata| metadata.file_type().is_dir());
    if STAGING_VERIFIED.load(Ordering::Acquire) && still_there() {
        return dir.clone();
    }
    match ensure_private_dir(dir).inspect(|()| STAGING_VERIFIED.store(true, Ordering::Release)) {
        Ok(()) => dir.clone(),
        Err(error) => {
            tracing::error!("staging folder {} is unusable: {error}", dir.display());
            emergency_dir()
        }
    }
}

/// Without an AppHandle (unit tests, early CLI paths) mirror what Tauri's `app_cache_dir`
/// resolves to, from the environment: still per user, never a guessable name in shared /tmp.
fn fallback_staging_dir() -> PathBuf {
    user_cache_dir()
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(APP_IDENTIFIER).join(STAGING_FOLDER_NAME))
        .unwrap_or_else(emergency_dir)
}

fn user_cache_dir() -> Option<PathBuf> {
    let env = |key: &str| std::env::var_os(key).filter(|value| !value.is_empty()).map(PathBuf::from);
    #[cfg(windows)]
    return env("LOCALAPPDATA");
    #[cfg(target_os = "macos")]
    return env("HOME").map(|home| home.join("Library").join("Caches"));
    #[cfg(all(unix, not(target_os = "macos")))]
    return env("XDG_CACHE_HOME").or_else(|| env("HOME").map(|home| home.join(".cache")));
}

/// A fresh, randomly named private folder under temp, created once per process. Creating it
/// with `create_dir` (not `_all`) fails if anything already sits at that name.
fn emergency_dir() -> PathBuf {
    EMERGENCY_DIR
        .get_or_init(|| {
            for _ in 0..8 {
                let dir = std::env::temp_dir().join(format!("vibe-staging-{}", random_string(16)));
                if create_private_dir(&dir).is_ok() {
                    return dir;
                }
            }
            tracing::error!("could not create a private staging folder; using the temp dir");
            std::env::temp_dir()
        })
        .clone()
}

#[cfg(unix)]
fn create_private_dir(dir: &std::path::Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    std::fs::DirBuilder::new().mode(0o700).create(dir)
}

#[cfg(not(unix))]
fn create_private_dir(dir: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir(dir)
}

/// Create the folder if needed and make sure it is a real directory (not a symlink) that only
/// the current user can enter.
fn ensure_private_dir(dir: &std::path::Path) -> std::io::Result<()> {
    use std::io::{Error, ErrorKind};
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match create_private_dir(dir) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error),
    }
    let metadata = std::fs::symlink_metadata(dir)?;
    if !metadata.file_type().is_dir() {
        return Err(Error::other("not a directory (or a symlink)"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        // chmod succeeds only for the owner (or root), so it doubles as the ownership check
        // without a getuid binding, and it tightens a folder an older build left open.
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
        let metadata = std::fs::symlink_metadata(dir)?;
        if !metadata.file_type().is_dir() || metadata.mode() & 0o077 != 0 {
            return Err(Error::other("folder is not private to this user"));
        }
    }
    Ok(())
}

pub fn find_ffmpeg_path() -> Option<PathBuf> {
    if let Ok(path) = which(EXECUTABLE_NAME) {
        return Some(path);
    }

    let cwd = std::env::current_dir().ok()?;
    let ffmpeg_in_cwd = cwd.join(EXECUTABLE_NAME);
    if ffmpeg_in_cwd.is_file() && ffmpeg_in_cwd.exists() {
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

pub fn normalize(input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    tracing::debug!("ffmpeg path is {}", ffmpeg_path.display());

    let mut cmd = Command::new(ffmpeg_path);
    let cmd = cmd.stderr(Stdio::piped()).args([
        "-i",
        input.to_str().context("tostr")?,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
    ]);

    cmd.args(additional_ffmpeg_args.unwrap_or_default());

    cmd.args([output.to_str().context("tostr")?, "-hide_banner", "-y", "-loglevel", "error"]);

    tracing::debug!("cmd: {:?}", cmd);

    let cmd = cmd.stdin(Stdio::null());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        let mut stderr_output = String::new();
        if let Some(ref mut stderr) = pid.stderr {
            stderr.take(1000).read_to_string(&mut stderr_output)?;
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
        a.to_str().context("tostr")?,
        "-i",
        b.to_str().context("tostr")?,
        "-filter_complex",
        // amix averages by default, which costs 6 dB on a two-input mix, and `-ac 2` used to
        // add another 3 dB of mono->stereo rematrix on top -- 9 dB thrown away on every
        // recording that had system audio selected. Sum instead, and let normalize() do the
        // single downmix to mono rather than producing stereo here just to collapse it later.
        // Summing can clip when the mic and the meeting are both loud, so cap the peaks.
        "amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.97",
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

#[cfg(test)]
mod staging_tests {
    use super::*;

    #[test]
    fn the_staging_folder_is_stable_and_private() {
        let first = get_vibe_temp_folder();
        assert_eq!(first, get_vibe_temp_folder());
        assert!(first.is_dir());
        assert!(!first.file_name().unwrap().to_string_lossy().starts_with("vibe_temp"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_eq!(std::fs::symlink_metadata(&first).unwrap().mode() & 0o777, 0o700);
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_or_open_staging_folder_is_refused_or_tightened() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let root = std::env::temp_dir().join(format!("vibe-staging-test-{}", random_string(12)));
        std::fs::create_dir(&root).unwrap();
        let target = root.join("elsewhere");
        std::fs::create_dir(&target).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(ensure_private_dir(&link).is_err());

        let open = root.join("open");
        std::fs::create_dir(&open).unwrap();
        std::fs::set_permissions(&open, std::fs::Permissions::from_mode(0o777)).unwrap();
        ensure_private_dir(&open).unwrap();
        assert_eq!(std::fs::metadata(&open).unwrap().mode() & 0o777, 0o700);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
