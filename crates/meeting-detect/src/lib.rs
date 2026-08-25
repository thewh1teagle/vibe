//! Detect whether a known meeting application currently owns the microphone.
//!
//! This crate intentionally contains no UI, recording, async runtime, or Tauri integration.

mod mic;
mod process;
mod window_title;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const DEFAULT_DEBOUNCE: Duration = Duration::from_secs(5);
const MIN_INTERVAL: Duration = Duration::from_millis(100);

/// A supported meeting source.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Zoom,
    Teams,
    Meet,
}

/// One snapshot of the current meeting signal.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct MeetingState {
    pub recording: bool,
    pub source: Option<Source>,
}

impl MeetingState {
    fn inactive() -> Self {
        Self {
            recording: false,
            source: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ProcessKind {
    Zoom,
    Teams,
    Browser,
}

/// Process identity shared by the platform-specific signal and title layers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ProcessInfo {
    pub(crate) pid: Option<u32>,
    pub(crate) name: String,
    pub(crate) executable: Option<String>,
    pub(crate) bundle_id: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct MicUsage {
    pub(crate) active: bool,
    /// Empty when the OS exposes microphone activity but not its owner (notably macOS).
    pub(crate) processes: Vec<ProcessInfo>,
}

/// Perform one synchronous poll.
pub fn detect() -> MeetingState {
    poll().state
}

#[derive(Clone, Debug)]
struct DetectionSnapshot {
    state: MeetingState,
    mic_active: bool,
}

fn poll() -> DetectionSnapshot {
    let usage = mic::current_usage();
    if !usage.active {
        return DetectionSnapshot {
            state: MeetingState::inactive(),
            mic_active: false,
        };
    }

    let processes = if usage.processes.is_empty() {
        process::running_candidates()
    } else {
        usage.processes
    };
    DetectionSnapshot {
        state: classify_active(processes),
        mic_active: true,
    }
}

fn classify_active(processes: Vec<ProcessInfo>) -> MeetingState {
    if processes.is_empty() {
        return MeetingState::inactive();
    }

    if processes.iter().any(|info| process::source(info) == Some(ProcessKind::Zoom)) {
        return attributed(Source::Zoom);
    }
    if processes.iter().any(|info| process::source(info) == Some(ProcessKind::Teams)) {
        return attributed(Source::Teams);
    }

    let browsers: Vec<_> = processes
        .iter()
        .filter(|info| process::source(info) == Some(ProcessKind::Browser))
        .cloned()
        .collect();
    if !browsers.is_empty() && window_title::meet_process(&browsers).is_some() {
        return attributed(Source::Meet);
    }

    MeetingState::inactive()
}

fn attributed(source: Source) -> MeetingState {
    MeetingState {
        recording: true,
        source: Some(source),
    }
}

/// A cancellable microphone watcher. Dropping it stops and joins its worker promptly.
pub struct Watcher {
    receiver: Receiver<MeetingState>,
    cancel: Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl Watcher {
    pub fn recv_timeout(&self, timeout: Duration) -> Result<MeetingState, RecvTimeoutError> {
        self.receiver.recv_timeout(timeout)
    }

    pub fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        let _ = self.cancel.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Iterator for Watcher {
    type Item = MeetingState;

    fn next(&mut self) -> Option<Self::Item> {
        self.receiver.recv().ok()
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

/// Poll on a background thread and emit only stable state changes.
///
/// A change must remain stable for roughly five seconds. Once Meet is confirmed, transient title
/// loss does not downgrade it while the same browser microphone session remains active.
pub fn watch(interval: Duration) -> Watcher {
    watch_with(interval, DEFAULT_DEBOUNCE, poll)
}

fn watch_with<F>(interval: Duration, debounce: Duration, mut poll: F) -> Watcher
where
    F: FnMut() -> DetectionSnapshot + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    let (cancel, cancellation) = mpsc::channel();
    let worker = thread::spawn(move || {
        let interval = interval.max(MIN_INTERVAL);
        let mut emitted: Option<MeetingState> = None;
        let mut candidate: Option<(MeetingState, Instant)> = None;
        // Set only when a Meet state is actually emitted. A one-poll title match must pass the
        // debounce before it earns the sticky behavior.
        let mut hold_meet = false;

        loop {
            let snapshot = poll();
            let mut next = snapshot.state;
            // A browser can stop exposing the Meet title as soon as the user switches tabs. Once
            // Meet has survived the debounce, retain that attribution until the mic is released.
            if snapshot.mic_active && hold_meet {
                next = attributed(Source::Meet);
            }

            if emitted.is_none() {
                if sender.send(next.clone()).is_err() {
                    break;
                }
                update_meet_hold(&next, &mut hold_meet);
                emitted = Some(next);
                candidate = None;
            } else if emitted.as_ref() == Some(&next) {
                candidate = None;
            } else {
                match &mut candidate {
                    Some((pending, since)) if *pending == next => {
                        if since.elapsed() >= debounce {
                            if sender.send(next.clone()).is_err() {
                                break;
                            }
                            update_meet_hold(&next, &mut hold_meet);
                            emitted = Some(next);
                            candidate = None;
                        }
                    }
                    slot => *slot = Some((next, Instant::now())),
                }
            }

            match cancellation.recv_timeout(interval) {
                Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
    });
    Watcher {
        receiver,
        cancel,
        worker: Some(worker),
    }
}

fn update_meet_hold(state: &MeetingState, hold_meet: &mut bool) {
    if !state.recording {
        *hold_meet = false;
    } else if state.source == Some(Source::Meet) {
        *hold_meet = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    fn process(name: &str) -> ProcessInfo {
        ProcessInfo {
            pid: Some(1),
            name: name.to_string(),
            executable: None,
            bundle_id: None,
        }
    }

    #[test]
    fn zoom_and_teams_take_priority_over_browser_fallback() {
        assert_eq!(
            classify_active(vec![process("chrome"), process("zoom")]).source,
            Some(Source::Zoom)
        );
        assert_eq!(
            classify_active(vec![process("firefox"), process("ms-teams")]).source,
            Some(Source::Teams)
        );
    }

    #[test]
    fn ordinary_browser_microphone_use_is_not_a_meeting() {
        let state = classify_active(vec![process("chrome")]);
        assert!(!state.recording);
        assert_eq!(state.source, None);
    }

    #[test]
    fn watcher_emits_initial_state_and_stable_changes() {
        let inactive = MeetingState::inactive();
        let active = MeetingState {
            recording: true,
            source: Some(Source::Zoom),
        };
        let mut states = VecDeque::from([
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: false,
            },
            DetectionSnapshot {
                state: active.clone(),
                mic_active: true,
            },
            DetectionSnapshot {
                state: active.clone(),
                mic_active: true,
            },
            DetectionSnapshot {
                state: active.clone(),
                mic_active: true,
            },
        ]);
        let receiver = watch_with(Duration::from_millis(1), Duration::from_millis(150), move || {
            states.pop_front().unwrap_or_else(|| DetectionSnapshot {
                state: active.clone(),
                mic_active: true,
            })
        });

        assert_eq!(receiver.recv_timeout(Duration::from_secs(1)).unwrap(), inactive);
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(1)).unwrap().source,
            Some(Source::Zoom)
        );
    }

    #[test]
    fn watcher_holds_confirmed_meet_until_mic_release() {
        let meet = MeetingState {
            recording: true,
            source: Some(Source::Meet),
        };
        let inactive = MeetingState::inactive();
        let mut states = VecDeque::from([
            DetectionSnapshot {
                state: meet.clone(),
                mic_active: true,
            },
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: true,
            },
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: true,
            },
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: false,
            },
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: false,
            },
            DetectionSnapshot {
                state: inactive.clone(),
                mic_active: false,
            },
        ]);
        let receiver = watch_with(Duration::from_millis(1), Duration::from_millis(150), move || {
            states.pop_front().unwrap_or_else(|| DetectionSnapshot {
                state: MeetingState::inactive(),
                mic_active: false,
            })
        });

        assert_eq!(receiver.recv_timeout(Duration::from_secs(1)).unwrap(), meet);
        // Browser title loss is suppressed; the next emitted state is the stable mic release.
        assert!(!receiver.recv_timeout(Duration::from_secs(1)).unwrap().recording);
    }

    #[test]
    fn dropping_watcher_interrupts_a_long_poll_interval() {
        let started = Instant::now();
        let watcher = watch_with(Duration::from_secs(30), Duration::from_secs(1), || DetectionSnapshot {
            state: MeetingState::inactive(),
            mic_active: false,
        });
        watcher.recv_timeout(Duration::from_secs(1)).unwrap();
        drop(watcher);
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
