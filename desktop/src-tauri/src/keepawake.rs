//! Keeping the machine awake while Vibe needs it.
//!
//! This wraps the `keepawake` crate directly. We used to go through
//! `tauri-plugin-keepawake`, which is a thin wrapper around the same crate but
//! sat behind a cargo feature nothing ever enabled, so every call failed with
//! "plugin not found" and was swallowed by a `try`/`catch` in the frontend.
//!
//! Two details shape the code below:
//!
//! * Windows' `SetThreadExecutionState` applies to the *calling thread*, and the
//!   crate's guard calls it again when dropped. Tauri commands run on whichever
//!   async runtime thread is free, so creating and dropping the guard from
//!   commands would strand the flags on some pool thread. The guard therefore
//!   lives on one dedicated thread we talk to over a channel.
//! * More than one part of the app wants to be awake at once — a transcription
//!   running while handoff waits for a phone. Holds are named, and the single
//!   guard reflects the union of everything currently held, so one caller
//!   releasing cannot cut another one short.
//!
//! There is deliberately no "prevent explicit sleep" flag. The crate supports
//! one, but the OS restricts it to AC power and Windows refuses it outright on
//! any machine with modern standby, which is most laptops. A flag that silently
//! does nothing on most hardware is worse than not offering it.

use std::collections::HashMap;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;

use serde::Deserialize;

/// What a caller wants kept awake.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Flags {
    /// Keep the display on. Only appropriate for work the user is watching.
    pub display: bool,
    /// Keep the system from sleeping on its idle timer.
    pub idle: bool,
}

impl Flags {
    fn is_empty(&self) -> bool {
        !self.display && !self.idle
    }

    fn union(self, other: Self) -> Self {
        Self {
            display: self.display || other.display,
            idle: self.idle || other.idle,
        }
    }
}

/// Sent to the thread that owns the guard. `None` means "release everything".
struct Apply(Option<Flags>);

/// Managed state. Register one with `.manage()`; the worker thread lives as long
/// as the app does.
pub struct KeepAwake {
    holds: Mutex<HashMap<String, Flags>>,
    tx: Sender<Apply>,
}

impl KeepAwake {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<Apply>();

        std::thread::Builder::new()
            .name("keepawake".into())
            .spawn(move || {
                let mut guard: Option<keepawake::KeepAwake> = None;

                while let Ok(Apply(wanted)) = rx.recv() {
                    // Release before acquiring, never the other way round: on
                    // Windows the old guard's drop restores the execution state
                    // it saw when it was created, which would undo a new guard
                    // taken moments earlier.
                    drop(guard.take());

                    let Some(flags) = wanted else { continue };

                    match keepawake::Builder::default()
                        .display(flags.display)
                        .idle(flags.idle)
                        .reason("Vibe is working")
                        .app_name("Vibe")
                        .app_reverse_domain("github.com.thewh1teagle.vibe")
                        .create()
                    {
                        Ok(awake) => guard = Some(awake),
                        // Not fatal: the machine may sleep, but the work carries
                        // on. Nothing the user could act on, so we only log it.
                        Err(e) => tracing::error!("could not keep the machine awake: {e}"),
                    }
                }
            })
            .expect("failed to spawn the keepawake thread");

        Self {
            holds: Mutex::new(HashMap::new()),
            tx,
        }
    }

    /// Take a named hold, replacing any previous hold under the same name.
    pub fn hold(&self, tag: String, flags: Flags) {
        let mut holds = self.holds.lock().unwrap_or_else(|e| e.into_inner());
        holds.insert(tag, flags);
        self.reconcile(&holds);
    }

    /// Drop a named hold. Unknown names are ignored, so releasing twice is fine.
    pub fn release(&self, tag: &str) {
        let mut holds = self.holds.lock().unwrap_or_else(|e| e.into_inner());
        holds.remove(tag);
        self.reconcile(&holds);
    }

    fn reconcile(&self, holds: &HashMap<String, Flags>) {
        let wanted = holds.values().copied().reduce(Flags::union).filter(|flags| !flags.is_empty());
        // The worker outlives the app, so a send only fails if it panicked —
        // in which case we are not keeping anything awake anyway.
        let _ = self.tx.send(Apply(wanted));
    }
}

impl Default for KeepAwake {
    fn default() -> Self {
        Self::new()
    }
}
