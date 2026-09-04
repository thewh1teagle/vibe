use eyre::{eyre, Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Home-relative folder each agent runtime scans for skills.
/// Both Claude Code and Codex look for `<home>/<dir>/skills/<name>/SKILL.md`.
fn runtime_folder(target: &str) -> Result<&'static str> {
    match target {
        "claude" => Ok(".claude"),
        "codex" => Ok(".codex"),
        other => Err(eyre!("unknown agent target: {other}")),
    }
}

/// Executables an agent can drive, resolved for this install.
#[derive(serde::Serialize)]
pub struct AgentPaths {
    /// The bundled server binary — transcribes from the command line, no server and no GUI needed.
    pub server: Option<String>,
    /// The Vibe app itself, for suggesting the user open it. It takes no useful CLI flags.
    pub vibe: Option<String>,
}

/// Resolve the paths baked into an installed skill. Both are optional: a missing binary should
/// leave the rest of the skill usable rather than failing the install.
#[tauri::command]
pub fn get_agent_paths(app_handle: tauri::AppHandle) -> AgentPaths {
    AgentPaths {
        server: crate::cmd::server_cmd::resolve_server_binary(&app_handle)
            .ok()
            .map(|path| path.display().to_string()),
        vibe: std::env::current_exe().ok().map(|path| path.display().to_string()),
    }
}

/// Write the skill under `home`, creating `<runtime>/skills/vibe/` on the way.
/// Overwriting is intended: reinstalling is how a stale API base URL gets refreshed.
fn write_skill(home: &Path, target: &str, contents: &str) -> Result<PathBuf> {
    let folder = home.join(runtime_folder(target)?).join("skills").join("vibe");
    fs::create_dir_all(&folder).context("create the agent skill folder")?;
    let path = folder.join("SKILL.md");
    fs::write(&path, contents).context("write the agent skill file")?;
    Ok(path)
}

/// Install the Vibe skill for one agent runtime.
///
/// The target lives outside every directory the fs plugin is scoped to, so this goes through
/// `std::fs` here instead of the frontend — no capability to widen, and nothing the browser mock
/// can silently satisfy in the real app's place.
///
/// @returns the absolute path written, so the UI can tell the user where the skill went.
#[tauri::command]
pub fn install_agent_skill(app_handle: tauri::AppHandle, target: String, contents: String) -> Result<PathBuf> {
    let home = app_handle.path().home_dir().context("resolve the home directory")?;
    let path = write_skill(&home, &target, &contents)?;
    tracing::debug!("installed the agent skill to {}", path.display());
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::{runtime_folder, write_skill};

    #[test]
    fn maps_known_targets_only() {
        assert_eq!(runtime_folder("claude").unwrap(), ".claude");
        assert_eq!(runtime_folder("codex").unwrap(), ".codex");
        assert!(runtime_folder("cursor").is_err());
    }

    #[test]
    fn creates_the_skill_folder_and_overwrites_an_earlier_install() {
        let home = std::env::temp_dir().join(format!("vibe-skill-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);

        let path = write_skill(&home, "codex", "first").unwrap();
        assert_eq!(path, home.join(".codex/skills/vibe/SKILL.md"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first");

        let again = write_skill(&home, "codex", "second").unwrap();
        assert_eq!(again, path);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");

        std::fs::remove_dir_all(&home).unwrap();
    }
}
