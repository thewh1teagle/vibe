//! Detect whether a known meeting application currently owns the microphone.
//!
//! This crate intentionally contains no UI, recording, async runtime, or Tauri integration.

mod mic;
mod process;
mod window_title;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// A meeting that has just started should surface almost immediately, so a new recording state
/// only has to survive a couple of polls.
const DEFAULT_ONSET_DEBOUNCE: Duration = Duration::from_millis(400);
/// The microphone being closed outright ends the call unambiguously, so it is confirmed almost as
/// quickly as it is reported.
const DEFAULT_RELEASE_DEBOUNCE: Duration = Duration::from_millis(600);
/// Losing only the *attribution* while the microphone stays open is debounced far harder: a brief
/// hand-off inside a call must not tear the prompt down and put it back up.
const DEFAULT_ATTRIBUTION_DEBOUNCE: Duration = Duration::from_secs(5);
const MIN_INTERVAL: Duration = Duration::from_millis(50);
/// While the signal is still settling the poll rate is raised so the debounce, not the cadence,
/// decides how quickly a meeting is reported.
const UNSETTLED_INTERVAL: Duration = Duration::from_millis(150);
/// Enumerating on-screen windows to read browser titles costs milliseconds, far more than the rest
/// of a poll. While the state is settled it is rate-limited to this interval instead of running on
/// every poll; a pending change still scans at the full cadence.
const TITLE_SCAN_INTERVAL: Duration = Duration::from_millis(1000);

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

/// Whether the OS lets this app read other windows' titles — how a browser meeting is recognised.
///
/// Only macOS gates this, behind Screen Recording. Zoom and Teams are found through the process
/// list instead, so they keep working either way; it is Google Meet that goes quiet without it.
pub fn screen_recording_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        window_title::screen_recording_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Ask the OS for that permission, showing its prompt the first time.
pub fn request_screen_recording() -> bool {
    #[cfg(target_os = "macos")]
    {
        window_title::request_screen_recording()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Perform one synchronous poll.
pub fn detect() -> MeetingState {
    poll(true).state
}

#[derive(Clone, Debug)]
struct DetectionSnapshot {
    state: MeetingState,
    mic_active: bool,
    /// Whether a browser that could be hosting Meet is still running and a microphone candidate.
    browser_present: bool,
}

/// `scan_titles` enables the browser window-title lookup that identifies Meet. Callers that already
/// know the answer, or that are willing to wait for the next scan, pass `false` to skip the most
/// expensive part of a poll.
fn poll(scan_titles: bool) -> DetectionSnapshot {
    let usage = mic::current_usage();
    if !usage.active {
        return DetectionSnapshot {
            state: MeetingState::inactive(),
            mic_active: false,
            browser_present: false,
        };
    }

    let processes = if usage.processes.is_empty() {
        process::running_candidates()
    } else {
        usage.processes
    };
    let browser_present = processes
        .iter()
        .any(|info| process::source(info) == Some(ProcessKind::Browser));
    DetectionSnapshot {
        state: classify_active(processes, scan_titles),
        mic_active: true,
        browser_present,
    }
}

fn classify_active(processes: Vec<ProcessInfo>, scan_titles: bool) -> MeetingState {
    if processes.is_empty() {
        return MeetingState::inactive();
    }

    if processes.iter().any(|info| process::source(info) == Some(ProcessKind::Zoom)) {
        return attributed(Source::Zoom);
    }
    if processes.iter().any(|info| process::source(info) == Some(ProcessKind::Teams)) {
        return attributed(Source::Teams);
    }

    if !scan_titles {
        return MeetingState::inactive();
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

/// How long a change must persist before it is emitted, per direction.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Debounce {
    /// Applied to any change that reports a meeting.
    onset: Duration,
    /// Applied to losing a meeting because the microphone was closed.
    release: Duration,
    /// Applied to losing a meeting while the microphone stays open.
    attribution: Duration,
}

impl Debounce {
    fn for_change(&self, next: &MeetingState, mic_active: bool) -> Duration {
        match (next.recording, mic_active) {
            (true, _) => self.onset,
            (false, false) => self.release,
            (false, true) => self.attribution,
        }
    }
}

impl Default for Debounce {
    fn default() -> Self {
        Self {
            onset: DEFAULT_ONSET_DEBOUNCE,
            release: DEFAULT_RELEASE_DEBOUNCE,
            attribution: DEFAULT_ATTRIBUTION_DEBOUNCE,
        }
    }
}

/// Poll on a background thread and emit only stable state changes.
///
/// A new meeting only has to survive a few hundred milliseconds, and so does the microphone being
/// closed — quitting the call clears the state promptly. Only losing the attribution *while* the
/// microphone stays open is held for roughly five seconds. Polling speeds up on its own while the
/// signal is unsettled, so `interval` is the idle cadence rather than the detection latency. Once
/// Meet is confirmed, transient title loss does not downgrade it while the same browser keeps the
/// microphone session open.
pub fn watch(interval: Duration) -> Watcher {
    watch_with(interval, Debounce::default(), poll)
}

fn watch_with<F>(interval: Duration, debounce: Debounce, mut poll: F) -> Watcher
where
    F: FnMut(bool) -> DetectionSnapshot + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    let (cancel, cancellation) = mpsc::channel();
    let worker = thread::spawn(move || {
        let interval = interval.max(MIN_INTERVAL);
        let unsettled_interval = UNSETTLED_INTERVAL.max(MIN_INTERVAL).min(interval);
        let mut emitted: Option<MeetingState> = None;
        let mut mic_active = false;
        let mut candidate: Option<(MeetingState, Instant)> = None;
        // Set only when a Meet state is actually emitted. A one-poll title match must pass the
        // debounce before it earns the sticky behavior.
        let mut hold_meet = false;
        let mut last_title_scan: Option<Instant> = None;
        // The first poll always scans, and so does any poll taken while the signal is in motion.
        let mut unsettled = true;

        loop {
            // Skipping the window scan while Meet is held costs nothing: the hold below overrides
            // whatever the scan would have returned for the rest of this microphone session.
            let scan_titles =
                !hold_meet && (unsettled || last_title_scan.is_none_or(|scanned| scanned.elapsed() >= TITLE_SCAN_INTERVAL));
            let snapshot = poll(scan_titles);
            if scan_titles {
                last_title_scan = Some(Instant::now());
            }
            // The microphone opening or closing is the leading edge of every change worth
            // reporting, so keep polling fast until the state that follows it has been emitted.
            let mic_changed = snapshot.mic_active != mic_active;
            mic_active = snapshot.mic_active;
            let mut next = snapshot.state;
            // A browser can stop exposing the Meet title as soon as the user switches tabs. Once
            // Meet has survived the debounce, retain that attribution until the mic is released or
            // the browser itself goes away — quitting the browser must not strand the prompt.
            if snapshot.mic_active && snapshot.browser_present && hold_meet {
                next = attributed(Source::Meet);
            }

            if !snapshot.mic_active || !snapshot.browser_present {
                hold_meet = false;
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
                        if since.elapsed() >= debounce.for_change(&next, snapshot.mic_active) {
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

            unsettled = candidate.is_some() || mic_changed;
            let wait = if unsettled { unsettled_interval } else { interval };
            match cancellation.recv_timeout(wait) {
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

    fn debounce(onset_ms: u64, loss_ms: u64) -> Debounce {
        Debounce {
            onset: Duration::from_millis(onset_ms),
            release: Duration::from_millis(loss_ms),
            attribution: Duration::from_millis(loss_ms),
        }
    }

    fn snapshot(state: MeetingState, mic_active: bool) -> DetectionSnapshot {
        DetectionSnapshot {
            browser_present: mic_active,
            state,
            mic_active,
        }
    }

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
            classify_active(vec![process("chrome"), process("zoom")], true).source,
            Some(Source::Zoom)
        );
        assert_eq!(
            classify_active(vec![process("firefox"), process("ms-teams")], true).source,
            Some(Source::Teams)
        );
    }

    #[test]
    fn ordinary_browser_microphone_use_is_not_a_meeting() {
        let state = classify_active(vec![process("chrome")], true);
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
            snapshot(inactive.clone(), false),
            snapshot(active.clone(), true),
            snapshot(active.clone(), true),
            snapshot(active.clone(), true),
        ]);
        let receiver = watch_with(Duration::from_millis(1), debounce(150, 150), move |_| {
            states.pop_front().unwrap_or_else(|| snapshot(active.clone(), true))
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
            snapshot(meet.clone(), true),
            snapshot(inactive.clone(), true),
            snapshot(inactive.clone(), true),
            snapshot(inactive.clone(), false),
            snapshot(inactive.clone(), false),
            snapshot(inactive.clone(), false),
        ]);
        let receiver = watch_with(Duration::from_millis(1), debounce(150, 150), move |_| {
            states
                .pop_front()
                .unwrap_or_else(|| snapshot(MeetingState::inactive(), false))
        });

        assert_eq!(receiver.recv_timeout(Duration::from_secs(1)).unwrap(), meet);
        // Browser title loss is suppressed; the next emitted state is the stable mic release.
        assert!(!receiver.recv_timeout(Duration::from_secs(1)).unwrap().recording);
    }

    #[test]
    fn a_new_meeting_is_emitted_far_sooner_than_a_lost_one() {
        let active = MeetingState {
            recording: true,
            source: Some(Source::Zoom),
        };
        let watcher = watch_with(Duration::from_millis(1), debounce(50, 10_000), {
            let active = active.clone();
            let mut polls = 0_u32;
            move |_| {
                polls += 1;
                // Inactive once, then a meeting that never goes away.
                snapshot(
                    if polls == 1 {
                        MeetingState::inactive()
                    } else {
                        active.clone()
                    },
                    polls > 1,
                )
            }
        });

        assert!(!watcher.recv_timeout(Duration::from_secs(1)).unwrap().recording);
        let started = Instant::now();
        assert_eq!(watcher.recv_timeout(Duration::from_secs(1)).unwrap(), active);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn closing_the_microphone_clears_the_meeting_without_the_attribution_debounce() {
        let active = MeetingState {
            recording: true,
            source: Some(Source::Zoom),
        };
        let debounce = Debounce {
            onset: Duration::from_millis(10),
            release: Duration::from_millis(50),
            attribution: Duration::from_secs(30),
        };
        let watcher = watch_with(Duration::from_millis(1), debounce, {
            let active = active.clone();
            let mut polls = 0_u32;
            // In a call, then the user quits it and the mic closes for good.
            move |_| match polls {
                0..=3 => {
                    polls += 1;
                    snapshot(active.clone(), true)
                }
                _ => snapshot(MeetingState::inactive(), false),
            }
        });

        assert_eq!(watcher.recv_timeout(Duration::from_secs(1)).unwrap(), active);
        let started = Instant::now();
        assert!(!watcher.recv_timeout(Duration::from_secs(1)).unwrap().recording);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn quitting_the_browser_drops_a_held_meet_attribution() {
        let meet = MeetingState {
            recording: true,
            source: Some(Source::Meet),
        };
        let mut polls = 0_u32;
        let watcher = watch_with(Duration::from_millis(1), debounce(10, 50), {
            let meet = meet.clone();
            move |_| {
                polls += 1;
                // Meet is confirmed, then the browser quits while another app keeps the mic open.
                DetectionSnapshot {
                    state: if polls <= 3 { meet.clone() } else { MeetingState::inactive() },
                    mic_active: true,
                    browser_present: polls <= 3,
                }
            }
        });

        assert_eq!(watcher.recv_timeout(Duration::from_secs(1)).unwrap(), meet);
        assert!(!watcher.recv_timeout(Duration::from_secs(1)).unwrap().recording);
    }

    #[test]
    fn a_held_meet_stops_paying_for_the_window_scan() {
        use std::sync::{Arc, Mutex};

        let meet = MeetingState {
            recording: true,
            source: Some(Source::Meet),
        };
        let scans: Arc<Mutex<Vec<bool>>> = Arc::default();
        let watcher = watch_with(Duration::from_millis(1), debounce(10, 50), {
            let meet = meet.clone();
            let scans = Arc::clone(&scans);
            move |scan_titles| {
                scans.lock().unwrap().push(scan_titles);
                snapshot(meet.clone(), true)
            }
        });

        assert_eq!(watcher.recv_timeout(Duration::from_secs(1)).unwrap(), meet);
        // Let the watcher settle into the held state before sampling the requests.
        thread::sleep(Duration::from_millis(120));
        let taken = scans.lock().unwrap().len();
        thread::sleep(Duration::from_millis(120));
        let scans = scans.lock().unwrap();
        assert!(scans.len() > taken, "the watcher kept polling");
        assert!(scans[0], "the first poll must scan");
        assert!(
            scans[taken..].iter().all(|scanned| !scanned),
            "a held Meet must not keep scanning windows: {scans:?}"
        );
    }

    #[test]
    fn dropping_watcher_interrupts_a_long_poll_interval() {
        let started = Instant::now();
        let watcher = watch_with(Duration::from_secs(30), debounce(1000, 1000), |_| {
            snapshot(MeetingState::inactive(), false)
        });
        watcher.recv_timeout(Duration::from_secs(1)).unwrap();
        drop(watcher);
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
