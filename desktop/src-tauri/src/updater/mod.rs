//! App updates, start to finish. See `docs/UPDATER.md`.
//!
//! Everything about updating lives here: which channel to ask, when to ask, downloading,
//! reminding, installing, and coming back up. The webview only shows the state this module
//! publishes and passes on what a user can ask for (check now, install now, remind later).
//!
//! A newer version is downloaded in the background and then waits. Nothing is ever installed
//! unless the user asks: an install restarts the app, and only the user knows when that is fine.
//! An update that has waited a couple of days earns a reminder inside the app.

mod channel;
mod memory;
mod policy;
mod relaunch;
mod stage;

use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::Update;
use tokio::sync::Mutex;

use channel::Settings;
use memory::{now_secs, Memory};
use relaunch::Marker;

const STATE_EVENT: &str = "update-state";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
enum Phase {
    #[default]
    Idle,
    Checking,
    /// A newer version exists and has not been downloaded.
    Available,
    Downloading,
    /// Downloaded and verified; waiting for the user.
    Ready,
    Installing,
    /// Downloading or installing `version` failed; `error` says why.
    Failed,
}

/// What the webview is told. Mirrored by `UpdateState` in `desktop/src/lib/updater.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    phase: Phase,
    current_version: String,
    version: Option<String>,
    percent: Option<u64>,
    error: Option<String>,
    /// The user asked to update and is waiting for it: show progress.
    interactive: bool,
    /// This version has waited long enough to mention.
    remind: bool,
}

/// "Vibe was updated to …", shown once after an update.
#[derive(Debug, Clone, Serialize)]
pub struct Notice {
    from: String,
    to: String,
}

#[derive(Default)]
struct Inner {
    phase: Phase,
    found: Option<Update>,
    percent: Option<u64>,
    error: Option<String>,
    interactive: bool,
    last_check: Option<Instant>,
    /// When a background download last failed, to space out the retries.
    download_failed_at: Option<Instant>,
    memory: Memory,
    notice: Option<Notice>,
}

impl Inner {
    fn version(&self) -> Option<String> {
        self.found.as_ref().map(|update| update.version.clone())
    }

    /// The downloaded package on disk belongs to the version that was found.
    fn staged_for_found(&self) -> Option<&memory::Staged> {
        let found = self.found.as_ref()?;
        self.memory
            .staged
            .as_ref()
            .filter(|staged| staged.version == found.version && staged.signature == found.signature)
    }
}

/// Managed state: one per app.
pub struct Updater {
    inner: Mutex<Inner>,
    /// Held across a check, a download or an install, so the scheduler and the user never run two.
    work: Mutex<()>,
    started: Instant,
}

impl Default for Updater {
    fn default() -> Self {
        Self {
            inner: Mutex::default(),
            work: Mutex::default(),
            started: Instant::now(),
        }
    }
}

/// Checking on a schedule only makes sense for an installed release build.
fn scheduled() -> bool {
    !cfg!(debug_assertions) && !cfg!(feature = "e2e")
}

fn snapshot(app: &AppHandle, inner: &Inner) -> Snapshot {
    let waiting = matches!(inner.phase, Phase::Available | Phase::Ready | Phase::Failed) && inner.found.is_some();
    Snapshot {
        phase: inner.phase,
        current_version: app.package_info().version.to_string(),
        version: inner.version(),
        percent: inner.percent,
        error: inner.error.clone(),
        interactive: inner.interactive,
        remind: waiting && policy::remind_due(now_secs(), inner.memory.first_seen_at, inner.memory.snoozed_until),
    }
}

async fn publish(app: &AppHandle) -> Snapshot {
    let updater = app.state::<Updater>();
    let state = snapshot(app, &*updater.inner.lock().await);
    let _ = app.emit(STATE_EVENT, state.clone());
    state
}

async fn set<T>(app: &AppHandle, change: impl FnOnce(&mut Inner) -> T) -> T {
    let updater = app.state::<Updater>();
    let result = change(&mut *updater.inner.lock().await);
    publish(app).await;
    result
}

/// Called once at startup, before the main window exists. Reads what the previous copy left
/// behind. True when this launch is the restart of an update, which comes back in front.
pub fn begin(app: &AppHandle) -> bool {
    let updater = app.state::<Updater>();
    let current = app.package_info().version.to_string();
    let marker = relaunch::take(app);
    // Nothing else can hold the lock this early; `try_lock` because startup runs inside the async
    // runtime, where waiting for a lock is not allowed.
    let Ok(mut inner) = updater.inner.try_lock() else {
        return false;
    };
    inner.memory = Memory::load(app);
    // The package kept for the version now running has done its job.
    if inner.memory.staged.as_ref().is_some_and(|staged| staged.version == current) {
        stage::clear(app);
        inner.memory.staged = None;
        inner.memory.save(app);
    }

    let Some(marker) = marker else {
        return false;
    };
    if marker.to == current {
        tracing::info!("updated {} -> {}", marker.from, marker.to);
        crate::analytics::track_event_handle(app, crate::analytics::events::UPDATE_APPLIED);
        inner.notice = Some(Notice {
            from: marker.from.clone(),
            to: marker.to.clone(),
        });
    } else {
        // The install reported success and the old version is still here.
        tracing::error!("update to {} did not take; still on {current}", marker.to);
        crate::analytics::track_event_handle_with_props(
            app,
            crate::analytics::events::UPDATE_FAILED,
            Some(serde_json::json!({ "stage": "relaunch" })),
        );
    }
    marker.is_fresh(now_secs())
}

/// Start the scheduler. Returns at once; everything it does happens in the background.
pub fn start(app: &AppHandle) {
    if !scheduled() {
        tracing::debug!("updater: development or test build, no scheduled checks");
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(policy::TICK).await;
            tick(&app).await;
        }
    });
}

async fn tick(app: &AppHandle) {
    let updater = app.state::<Updater>();
    let since_last_check = updater.inner.lock().await.last_check.map(|at| at.elapsed());
    if policy::check_due(updater.started.elapsed(), since_last_check) {
        check(app).await;
    } else {
        // Time passing is what makes a reminder due; let the webview see it.
        publish(app).await;
    }

    let (phase, since_failure) = {
        let inner = updater.inner.lock().await;
        (inner.phase, inner.download_failed_at.map(|at| at.elapsed()))
    };
    if phase == Phase::Available && Settings::read(app).automatic && policy::download_due(since_failure) {
        let _ = download(app, false).await;
    }
}

/// Ask the channel for a newer version. A failed request changes nothing: being offline is not
/// an error worth showing, and a version already found stays found.
async fn check(app: &AppHandle) {
    let updater = app.state::<Updater>();
    let _work = updater.work.lock().await;
    let settings = Settings::read(app);
    let before = set(app, |inner| {
        inner.last_check = Some(Instant::now());
        let before = inner.phase;
        if matches!(before, Phase::Idle | Phase::Failed) {
            inner.phase = Phase::Checking;
        }
        before
    })
    .await;

    let found = channel::check(app, settings.channel).await;
    set(app, |inner| match found {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let same_as_before = inner.version().as_deref() == Some(version.as_str());
            inner.memory.note_seen(&version, now_secs());
            inner.found = Some(update);
            // A package on disk for exactly this release needs no second download.
            let on_disk = inner
                .staged_for_found()
                .cloned()
                .is_some_and(|staged| stage::read(app, &staged).is_some());
            if on_disk {
                inner.phase = Phase::Ready;
                inner.percent = Some(100);
                inner.error = None;
            } else {
                if inner.memory.staged.take().is_some() {
                    stage::clear(app);
                }
                if !same_as_before {
                    tracing::info!("update available: {version}");
                }
                inner.percent = None;
                // A failure for this same version stays visible until something changes.
                if same_as_before && before == Phase::Failed {
                    inner.phase = Phase::Failed;
                } else {
                    inner.error = None;
                    inner.phase = Phase::Available;
                }
            }
            inner.memory.save(app);
        }
        Ok(None) => {
            if inner.memory.staged.is_some() {
                stage::clear(app);
            }
            inner.memory.nothing_newer();
            inner.memory.save(app);
            inner.found = None;
            inner.phase = Phase::Idle;
            inner.percent = None;
            inner.error = None;
        }
        Err(error) => {
            tracing::debug!("update check failed: {error}");
            // Put back what was there: `Checking` was only for show.
            if inner.phase == Phase::Checking {
                inner.phase = if before == Phase::Failed && inner.found.is_some() {
                    Phase::Failed
                } else {
                    Phase::Idle
                };
            }
        }
    })
    .await;
}

/// Download the version that was found, verify it, and put it on disk. `watched` is a download
/// the user is waiting for: its failure is shown. One in the background fails quietly and is
/// tried again later.
async fn download(app: &AppHandle, watched: bool) -> Result<(), String> {
    let updater = app.state::<Updater>();
    let _work = updater.work.lock().await;
    let update = {
        let inner = updater.inner.lock().await;
        if inner.phase == Phase::Ready && inner.staged_for_found().is_some() {
            return Ok(());
        }
        inner.found.clone().ok_or("no update to download")?
    };
    set(app, |inner| {
        inner.phase = Phase::Downloading;
        inner.percent = Some(0);
        inner.error = None;
    })
    .await;

    let progress_app = app.clone();
    let mut downloaded = 0u64;
    let mut last_percent = None;
    let fetched = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let Some(total) = total.filter(|total| *total > 0) else {
                    return;
                };
                // Whole percents only: an event per chunk floods the webview.
                let percent = (downloaded * 100 / total).min(100);
                if last_percent != Some(percent) {
                    last_percent = Some(percent);
                    let app = progress_app.clone();
                    tauri::async_runtime::spawn(async move {
                        set(&app, |inner| inner.percent = Some(percent)).await;
                    });
                }
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())
        .and_then(|bytes| stage::write(app, &update.version, &update.signature, &bytes).map_err(|error| error.to_string()));

    match fetched {
        Ok(staged) => {
            set(app, |inner| {
                inner.memory.staged = Some(staged);
                inner.memory.save(app);
                inner.percent = Some(100);
                inner.download_failed_at = None;
                inner.phase = Phase::Ready;
            })
            .await;
            Ok(())
        }
        Err(message) => {
            tracing::warn!("update download failed: {message}");
            set(app, |inner| {
                inner.percent = None;
                if watched {
                    inner.phase = Phase::Failed;
                    inner.error = Some(message.clone());
                } else {
                    inner.phase = Phase::Available;
                    inner.download_failed_at = Some(Instant::now());
                }
            })
            .await;
            Err(message)
        }
    }
}

/// The transcription server is replaced by the update; Windows cannot overwrite it while it runs.
async fn stop_server(app: &AppHandle) {
    crate::cmd::config::set_api_base_url(app, None).ok();
    let state = app.state::<Mutex<crate::setup::ServerState>>();
    let mut guard = state.lock().await;
    if let Some(mut process) = guard.process.take() {
        process.kill();
    }
}

const PACKAGE_MISSING: &str = "the downloaded update is missing";

/// Install the downloaded version and restart into it. Only ever called because the user asked.
/// Returns only on failure.
async fn install(app: &AppHandle) -> Result<(), String> {
    let updater = app.state::<Updater>();
    let _work = updater.work.lock().await;
    let (update, bytes) = {
        let mut inner = updater.inner.lock().await;
        let Some(update) = inner.found.clone() else {
            return Err("no update to install".into());
        };
        let bytes = inner.staged_for_found().cloned().and_then(|staged| stage::read(app, &staged));
        let Some(bytes) = bytes else {
            // Gone or no longer signed: back to "available", to be fetched again.
            inner.memory.staged = None;
            inner.memory.save(app);
            inner.phase = Phase::Available;
            return Err(PACKAGE_MISSING.into());
        };
        inner.phase = Phase::Installing;
        (update, bytes)
    };
    publish(app).await;
    tracing::info!("installing update {}", update.version);

    stop_server(app).await;
    if let Err(error) = relaunch::write(app, &Marker::new(&update.current_version, &update.version)) {
        tracing::warn!("could not write the relaunch marker: {error}");
    }

    // On Windows this starts the installer and ends the process; elsewhere it returns.
    let installed = tokio::task::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|error| error.to_string())
        .and_then(|result| result.map_err(|error| error.to_string()));

    match installed {
        Ok(()) => {
            relaunch::restart(app);
            Ok(())
        }
        Err(message) => {
            tracing::error!("update install failed: {message}");
            relaunch::discard(app);
            crate::analytics::track_event_handle_with_props(
                app,
                crate::analytics::events::UPDATE_FAILED,
                Some(serde_json::json!({ "stage": "install" })),
            );
            set(app, |inner| {
                inner.phase = Phase::Failed;
                inner.error = Some(message.clone());
            })
            .await;
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn update_state(app: AppHandle, updater: State<'_, Updater>) -> Result<Snapshot, String> {
    Ok(snapshot(&app, &*updater.inner.lock().await))
}

/// Check right now, whatever the schedule says. Also how a changed setting takes effect.
#[tauri::command]
pub async fn update_check_now(app: AppHandle) -> Result<Snapshot, String> {
    check(&app).await;
    Ok(publish(&app).await)
}

/// The user asked to update: download if needed, install, restart in front.
#[tauri::command]
pub async fn update_install_now(app: AppHandle, updater: State<'_, Updater>) -> Result<(), String> {
    set(&app, |inner| inner.interactive = true).await;
    let result = async {
        if updater.inner.lock().await.found.is_none() {
            check(&app).await;
        }
        download(&app, true).await?;
        match install(&app).await {
            // The package vanished between the two steps: fetch it once more.
            Err(message) if message == PACKAGE_MISSING => {
                download(&app, true).await?;
                install(&app).await
            }
            other => other,
        }
    }
    .await;
    set(&app, |inner| inner.interactive = false).await;
    result
}

/// "Later" on the reminder.
#[tauri::command]
pub async fn update_remind_later(app: AppHandle) -> Result<Snapshot, String> {
    set(&app, |inner| {
        inner.memory.snoozed_until = Some(now_secs() + policy::SNOOZE_FOR.as_secs());
        inner.memory.save(&app);
    })
    .await;
    Ok(publish(&app).await)
}

/// The "updated to …" notice, once.
#[tauri::command]
pub async fn update_take_notice(updater: State<'_, Updater>) -> Result<Option<Notice>, String> {
    Ok(updater.inner.lock().await.notice.take())
}

/// Test builds only: go through the restart exactly as an update would, without installing
/// anything, so the way the app comes back can be checked.
#[cfg(feature = "e2e")]
#[tauri::command]
pub async fn update_simulate_relaunch(app: AppHandle) -> Result<(), String> {
    let version = app.package_info().version.to_string();
    relaunch::write(&app, &Marker::new(&version, &version)).map_err(|error| error.to_string())?;
    relaunch::restart(&app);
    Ok(())
}

/// Test builds only: show the webview a state of our choosing, to look at the banner and the
/// dialogs without a real update.
#[cfg(feature = "e2e")]
#[tauri::command]
pub fn update_simulate_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    app.emit(STATE_EVENT, state).map_err(|error| error.to_string())
}
