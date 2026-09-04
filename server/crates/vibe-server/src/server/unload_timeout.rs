use std::str::FromStr;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use std::{ops::Deref, ops::DerefMut};

use tokio::sync::{watch, Mutex, OwnedMutexGuard, TryLockError};
use tokio::time::Instant;

use super::ServerState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnloadTimeout(Option<Duration>);

impl UnloadTimeout {
    fn timeout(self) -> Option<Duration> {
        self.0
    }
}

impl FromStr for UnloadTimeout {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value == "0" {
            return Ok(Self(None));
        }

        let duration = humantime::parse_duration(value).map_err(|error| error.to_string())?;
        if duration.is_zero() {
            return Err("unload timeout must be greater than zero, or 0 to disable unloading".to_string());
        }
        Ok(Self(Some(duration)))
    }
}

#[derive(Clone)]
pub(super) struct UnloadTimeoutRuntime {
    timeout: Option<Duration>,
    deadline: watch::Sender<Option<Instant>>,
    state: Arc<StdMutex<ActivityState>>,
}

struct ActivityState {
    active_requests: usize,
    deadline: Option<Instant>,
}

struct DeadlineArm {
    runtime: UnloadTimeoutRuntime,
}

impl Drop for DeadlineArm {
    fn drop(&mut self) {
        self.runtime.finish_request();
    }
}

pub(super) struct ModelLease {
    // Rust drops fields in declaration order: release exclusive model access
    // first, then arm a fresh timeout from completion.
    guard: OwnedMutexGuard<ServerState>,
    _deadline_arm: DeadlineArm,
}

impl Deref for ModelLease {
    type Target = ServerState;

    fn deref(&self) -> &Self::Target {
        &self.guard
    }
}

impl DerefMut for ModelLease {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.guard
    }
}

impl UnloadTimeoutRuntime {
    pub(super) fn start(timeout: UnloadTimeout, state: Arc<Mutex<ServerState>>) -> Self {
        let timeout = timeout.timeout();
        let deadline = timeout.map(|duration| Instant::now() + duration);
        let (deadline_tx, receiver) = watch::channel(deadline);
        let runtime = Self {
            timeout,
            deadline: deadline_tx,
            state: Arc::new(StdMutex::new(ActivityState {
                active_requests: 0,
                deadline,
            })),
        };
        if runtime.timeout.is_some() {
            tokio::spawn(run(runtime.clone(), receiver, state));
        }
        runtime
    }

    fn begin_request(&self) -> DeadlineArm {
        if self.timeout.is_some() {
            if let Ok(mut state) = self.state.lock() {
                state.active_requests += 1;
                state.deadline = None;
            }
            self.deadline.send_replace(None);
        }
        DeadlineArm { runtime: self.clone() }
    }

    pub(super) async fn acquire(&self, state: Arc<Mutex<ServerState>>) -> ModelLease {
        let guard = state.lock_owned().await;
        let activity = self.begin_request();
        ModelLease {
            guard,
            _deadline_arm: activity,
        }
    }

    pub(super) fn try_acquire(&self, state: Arc<Mutex<ServerState>>) -> Result<ModelLease, TryLockError> {
        let guard = state.try_lock_owned()?;
        let activity = self.begin_request();
        Ok(ModelLease {
            guard,
            _deadline_arm: activity,
        })
    }

    fn finish_request(&self) {
        if let Some(timeout) = self.timeout {
            let mut deadline = None;
            if let Ok(mut state) = self.state.lock() {
                state.active_requests = state.active_requests.saturating_sub(1);
                if state.active_requests == 0 {
                    deadline = Some(Instant::now() + timeout);
                    state.deadline = deadline;
                }
            }
            if deadline.is_some() {
                self.deadline.send_replace(deadline);
            }
        }
    }

    fn can_unload(&self) -> bool {
        if self.timeout.is_none() {
            return false;
        }
        self.state
            .lock()
            .is_ok_and(|state| state.active_requests == 0 && state.deadline.is_some_and(|deadline| Instant::now() >= deadline))
    }

    async fn wait_until_expired(&self, receiver: &mut watch::Receiver<Option<Instant>>) -> bool {
        if self.timeout.is_none() {
            return false;
        }

        loop {
            let deadline = *receiver.borrow_and_update();
            match deadline {
                Some(deadline) => {
                    tokio::select! {
                        _ = tokio::time::sleep_until(deadline) => return true,
                        changed = receiver.changed() => {
                            if changed.is_err() {
                                return false;
                            }
                        }
                    }
                }
                None => {
                    if receiver.changed().await.is_err() {
                        return false;
                    }
                }
            }
        }
    }
}

async fn run(runtime: UnloadTimeoutRuntime, mut receiver: watch::Receiver<Option<Instant>>, state: Arc<Mutex<ServerState>>) {
    while runtime.wait_until_expired(&mut receiver).await {
        {
            let mut state = state.lock().await;
            if runtime.can_unload() && state.ctx.is_some() {
                tracing::info!("model unload timeout expired; unloading model");
                state.unload_model();
            }
        }

        // An active request resets the full timeout when it finishes. An
        // unloaded model has nothing more to monitor until activity resumes.
        if receiver.changed().await.is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_human_durations() {
        assert_eq!("5m".parse(), Ok(UnloadTimeout(Some(Duration::from_secs(300)))));
        assert_eq!("1h".parse(), Ok(UnloadTimeout(Some(Duration::from_secs(3600)))));
        assert_eq!("0".parse(), Ok(UnloadTimeout(None)));
    }

    #[test]
    fn rejects_zero_and_invalid_durations() {
        assert!("0s".parse::<UnloadTimeout>().is_err());
        assert!("never".parse::<UnloadTimeout>().is_err());
        assert!("later".parse::<UnloadTimeout>().is_err());
    }

    #[tokio::test(start_paused = true)]
    async fn activity_resets_expiration_deadline() {
        let timeout = Duration::from_secs(300);
        let deadline = Some(Instant::now() + timeout);
        let (deadline_tx, mut receiver) = watch::channel(deadline);
        let runtime = UnloadTimeoutRuntime {
            timeout: Some(timeout),
            deadline: deadline_tx,
            state: Arc::new(StdMutex::new(ActivityState {
                active_requests: 0,
                deadline,
            })),
        };

        tokio::time::advance(Duration::from_secs(299)).await;
        let request = runtime.begin_request();
        let wait = runtime.wait_until_expired(&mut receiver);
        tokio::pin!(wait);
        tokio::time::advance(Duration::from_secs(299)).await;
        assert!(tokio::time::timeout(Duration::ZERO, &mut wait).await.is_err());
        drop(request);
        tokio::time::advance(Duration::from_secs(300)).await;
        assert!(wait.await);
    }

    #[tokio::test(start_paused = true)]
    async fn active_request_gets_a_full_timeout_after_completion() {
        let timeout = Duration::from_secs(300);
        let deadline = Some(Instant::now() + timeout);
        let (deadline_tx, _) = watch::channel(deadline);
        let runtime = UnloadTimeoutRuntime {
            timeout: Some(timeout),
            deadline: deadline_tx,
            state: Arc::new(StdMutex::new(ActivityState {
                active_requests: 0,
                deadline,
            })),
        };
        let server_state = Arc::new(Mutex::new(ServerState::new()));

        let lease = runtime.acquire(server_state).await;
        assert!(runtime.state.lock().expect("timeout state").deadline.is_none());
        tokio::time::advance(Duration::from_secs(3600)).await;
        assert!(!runtime.can_unload());

        drop(lease);
        assert!(runtime.state.lock().expect("timeout state").deadline.is_some());
        assert!(!runtime.can_unload());
        tokio::time::advance(Duration::from_secs(299)).await;
        assert!(!runtime.can_unload());
        tokio::time::advance(Duration::from_secs(1)).await;
        assert!(runtime.can_unload());
    }
}
