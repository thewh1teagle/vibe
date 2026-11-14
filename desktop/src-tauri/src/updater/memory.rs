//! What the updater remembers between runs, in one small file next to the settings.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const FILE: &str = "update-memory.json";

/// A downloaded package waiting in the cache folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Staged {
    pub version: String,
    /// The release signature the package was checked against when it was downloaded.
    pub signature: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Memory {
    /// The newest version seen and when it was first seen (seconds since the Unix epoch), for the
    /// "this has been waiting a while" reminder.
    pub seen_version: Option<String>,
    pub first_seen_at: Option<u64>,
    /// The user said "later": no reminder before this time.
    pub snoozed_until: Option<u64>,
    pub staged: Option<Staged>,
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_config_dir().ok()?.join(FILE))
}

impl Memory {
    pub fn load(app: &AppHandle) -> Self {
        path(app)
            .and_then(|path| std::fs::read(path).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app: &AppHandle) {
        let Some(path) = path(app) else {
            return;
        };
        let written = serde_json::to_vec_pretty(self)
            .map_err(std::io::Error::other)
            .and_then(|bytes| std::fs::write(path, bytes));
        if let Err(error) = written {
            tracing::warn!("could not save the updater's memory: {error}");
        }
    }

    /// A version came back from a check. A new one starts its own clock and clears the snooze.
    pub fn note_seen(&mut self, version: &str, now: u64) {
        if self.seen_version.as_deref() != Some(version) {
            self.seen_version = Some(version.to_string());
            self.first_seen_at = Some(now);
            self.snoozed_until = None;
        }
    }

    /// Nothing newer exists: nothing to remember about it.
    pub fn nothing_newer(&mut self) {
        self.seen_version = None;
        self.first_seen_at = None;
        self.snoozed_until = None;
        self.staged = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_version_starts_its_own_clock_and_clears_the_snooze() {
        let mut memory = Memory::default();
        memory.note_seen("3.3.7", 100);
        memory.snoozed_until = Some(900);
        memory.note_seen("3.3.7", 500);
        assert_eq!(memory.first_seen_at, Some(100));
        assert_eq!(memory.snoozed_until, Some(900));
        memory.note_seen("3.3.8", 600);
        assert_eq!(memory.first_seen_at, Some(600));
        assert_eq!(memory.snoozed_until, None);
    }

    #[test]
    fn an_old_or_damaged_file_reads_as_empty() {
        assert_eq!(serde_json::from_str::<Memory>("{}").unwrap(), Memory::default());
        assert_eq!(
            serde_json::from_str::<Memory>(r#"{"seenVersion":"3.3.7","somethingNew":1}"#)
                .unwrap()
                .seen_version,
            Some("3.3.7".into())
        );
    }
}
