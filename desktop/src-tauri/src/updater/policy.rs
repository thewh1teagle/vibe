//! When the updater checks, retries and reminds. Pure, so every rule is tested.

use std::time::Duration;

/// First check after launch. Late enough that startup is over, early enough that a short session
/// still learns about an update.
pub const FIRST_CHECK_AFTER: Duration = Duration::from_secs(20);
/// A copy left running in the tray must still find updates; launch alone is not often enough.
pub const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);
/// How often the scheduler looks at the world.
pub const TICK: Duration = Duration::from_secs(30);
/// A background download that failed is tried again after this long.
pub const RETRY_DOWNLOAD_AFTER: Duration = Duration::from_secs(60 * 60);
/// An update that has been waiting this long is worth a reminder. Nothing installs by itself, so
/// this is what keeps people from staying on an old version for weeks.
pub const REMIND_AFTER: Duration = Duration::from_secs(2 * 24 * 60 * 60);
/// "Later" on the reminder keeps it away for this long.
pub const SNOOZE_FOR: Duration = Duration::from_secs(5 * 24 * 60 * 60);

/// Whether to remind the user now. Times are seconds since the Unix epoch.
pub fn remind_due(now: u64, first_seen_at: Option<u64>, snoozed_until: Option<u64>) -> bool {
    let Some(first_seen) = first_seen_at else {
        return false;
    };
    let waited_long_enough = now.saturating_sub(first_seen) >= REMIND_AFTER.as_secs();
    let snoozed = snoozed_until.is_some_and(|until| now < until);
    waited_long_enough && !snoozed
}

/// Whether a check is due: once shortly after launch, then on the interval.
pub fn check_due(since_launch: Duration, since_last_check: Option<Duration>) -> bool {
    match since_last_check {
        None => since_launch >= FIRST_CHECK_AFTER,
        Some(elapsed) => elapsed >= CHECK_EVERY,
    }
}

/// Whether a background download may start: at once the first time, later after a failure.
pub fn download_due(since_last_failure: Option<Duration>) -> bool {
    since_last_failure.is_none_or(|elapsed| elapsed >= RETRY_DOWNLOAD_AFTER)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reminds_after_two_days_and_respects_later() {
        let day = 24 * 60 * 60;
        assert!(!remind_due(10 * day, None, None));
        assert!(!remind_due(day, Some(0), None));
        assert!(remind_due(2 * day, Some(0), None));
        // "Later" on day 2 is quiet until day 7.
        assert!(!remind_due(6 * day, Some(0), Some(7 * day)));
        assert!(remind_due(7 * day, Some(0), Some(7 * day)));
        // A clock set back must not produce a reminder.
        assert!(!remind_due(0, Some(3 * day), None));
    }

    #[test]
    fn checks_once_after_launch_then_on_the_interval() {
        assert!(!check_due(Duration::from_secs(5), None));
        assert!(check_due(FIRST_CHECK_AFTER, None));
        assert!(!check_due(Duration::from_secs(3600), Some(Duration::from_secs(60))));
        assert!(check_due(Duration::from_secs(99_999), Some(CHECK_EVERY)));
    }

    #[test]
    fn a_failed_download_waits_before_the_next_try() {
        assert!(download_due(None));
        assert!(!download_due(Some(Duration::from_secs(60))));
        assert!(download_due(Some(RETRY_DOWNLOAD_AFTER)));
    }
}
