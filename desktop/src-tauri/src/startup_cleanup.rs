//! Housekeeping that runs once at launch: old logs, stale staged media, updater leftovers.

use crate::error::LogError;
use crate::ffmpeg::get_vibe_temp_folder;
use crate::{cmd::app::get_logs_folder, config, logging::get_log_path};
use eyre::{eyre, ContextCompat, Result};
use std::path::Path;
use std::time::{Duration, SystemTime};

pub fn remove_old_logs(app: &tauri::AppHandle) -> Result<()> {
    tracing::debug!("clean old logs");
    let current_log_path = get_log_path(&app.clone())?;

    // Get logs folder
    let logs_folder = get_logs_folder(app.to_owned()).map_err(crate::error::Error::into_report)?;
    let logs_folder = logs_folder.to_str().context("tostr")?;

    // Remove suffix
    let logs_folder = logs_folder.strip_suffix('/').unwrap_or(logs_folder);
    let logs_folder = logs_folder.strip_suffix('\\').unwrap_or(logs_folder);
    let pattern = format!(
        "{}/{}*{}",
        logs_folder,
        config::LOG_FILENAME_PREFIX,
        config::LOG_FILENAME_SUFFIX
    );
    tracing::debug!("searching old logs in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        if path == current_log_path {
            tracing::debug!("Skip clean of current log path {}", path.display());
            continue;
        }
        tracing::debug!("clean old log {}", path.display());
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Staged files older than this are swept at launch. A recording whose transcription failed is
/// the only copy, so anything newer survives a restart.
const STAGING_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

pub fn sweep_staging() -> Result<()> {
    remove_legacy_temp_folders()?;
    remove_stale_staged_files(&get_vibe_temp_folder(), STAGING_MAX_AGE, SystemTime::now());
    Ok(())
}

/// Older builds staged files in a predictable `$TMP/vibe_temp_<date>`. Nothing writes there any
/// more, so every one of them goes, today's included.
fn remove_legacy_temp_folders() -> Result<()> {
    let temp_dir = std::env::temp_dir();
    let temp_dir = temp_dir.to_str().unwrap_or_default();
    // Remove suffix
    let temp_dir = temp_dir.strip_suffix('/').unwrap_or(temp_dir);
    let temp_dir = temp_dir.strip_suffix('\\').unwrap_or(temp_dir);
    let pattern = format!("{}/vibe_temp*", glob::Pattern::escape(temp_dir));
    tracing::debug!("searching legacy temp folders in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        // In shared /tmp the name may belong to someone else's symlink; never follow it.
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.file_type().is_dir() {
            continue;
        }
        tracing::debug!("Clean legacy folder {}", path.display());
        std::fs::remove_dir_all(&path)
            .map_err(|e| eyre!("failed to delete {}: {:?}", path.display(), e))
            .log_error();
    }
    Ok(())
}

/// Delete the staging folder's direct entries last modified before `now - max_age`. Symlinks are
/// removed as links, never followed; `remove_dir_all` does not follow links inside a folder.
fn remove_stale_staged_files(dir: &Path, max_age: Duration, now: SystemTime) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => {
            tracing::warn!("cannot read staging folder {}: {error}", dir.display());
            return;
        }
    };
    let cutoff = now.checked_sub(max_age).unwrap_or(SystemTime::UNIX_EPOCH);
    for entry in entries.flatten() {
        let path = entry.path();
        // DirEntry metadata does not traverse symlinks.
        let Ok(metadata) = entry.metadata() else { continue };
        let Ok(modified) = metadata.modified() else { continue };
        if modified >= cutoff {
            continue;
        }
        tracing::debug!("Clean old staged file {}", path.display());
        let result = if metadata.file_type().is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        result
            .map_err(|e| eyre!("failed to delete {}: {:?}", path.display(), e))
            .log_error();
    }
}

pub fn remove_updater_leftovers() -> Result<()> {
    let current_temp_dir = get_vibe_temp_folder();
    let temp_dir = std::env::temp_dir();
    let temp_dir = temp_dir.to_str().unwrap_or_default();
    // Remove suffix
    let temp_dir = temp_dir.strip_suffix('/').unwrap_or(temp_dir);
    let temp_dir = temp_dir.strip_suffix('\\').unwrap_or(temp_dir);
    let pattern = format!("{}/vibe*-updater*", temp_dir);
    tracing::debug!("searching old files in {}", pattern);
    for path in glob::glob(&pattern)? {
        let path = path?;
        if path == current_temp_dir {
            tracing::debug!("Skip deletion of {}", current_temp_dir.display());
            continue;
        }
        if path.is_dir() {
            tracing::debug!("Clean old folder {}", path.display());
            std::fs::remove_dir_all(&path)
                .map_err(|e| eyre!("failed to delete {}: {:?}", path.display(), e))
                .log_error();
        } else {
            tracing::debug!("Skipping non-directory path {}", path.display());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vibe-startup-cleanup-test-{}", crate::ffmpeg::random_string(12)));
        std::fs::create_dir(&dir).unwrap();
        dir
    }

    fn write_aged(path: &Path, now: SystemTime, age: Duration) {
        std::fs::write(path, b"x").unwrap();
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(now - age).unwrap();
    }

    #[test]
    fn staging_sweep_keeps_files_younger_than_the_limit() {
        let dir = scratch();
        let hour = Duration::from_secs(60 * 60);
        // Judge from two days ahead so the folder created just now also counts as old (std cannot
        // set a directory's mtime everywhere); file times are set relative to the same instant.
        let now = SystemTime::now() + 48 * hour;
        let old = dir.join("old.wav");
        let fresh = dir.join("fresh.wav");
        let almost = dir.join("almost-a-day.wav");
        write_aged(&old, now, 25 * hour);
        write_aged(&fresh, now, Duration::from_secs(60));
        write_aged(&almost, now, 23 * hour);
        let old_dir = dir.join("old-folder");
        std::fs::create_dir(&old_dir).unwrap();

        remove_stale_staged_files(&dir, STAGING_MAX_AGE, now);

        assert!(!old.exists());
        assert!(!old_dir.exists());
        assert!(fresh.exists());
        assert!(almost.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn staging_sweep_never_follows_symlinks() {
        let dir = scratch();
        let outside = scratch();
        let victim = outside.join("keep.txt");
        std::fs::write(&victim, b"x").unwrap();
        let link = dir.join("link");
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        // Everything in the folder counts as old at this instant.
        remove_stale_staged_files(&dir, STAGING_MAX_AGE, SystemTime::now() + Duration::from_secs(72 * 60 * 60));

        assert!(std::fs::symlink_metadata(&link).is_err(), "the link itself is swept");
        assert!(victim.exists(), "its target is untouched");
        std::fs::remove_dir_all(&dir).unwrap();
        std::fs::remove_dir_all(&outside).unwrap();
    }
}
