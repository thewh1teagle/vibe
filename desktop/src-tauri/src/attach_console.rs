use std::env;
use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};

/// Attach to console if available and RUST_LOG was set
pub fn attach() {
    if env::var("RUST_LOG").is_ok() {
        // we ignore the result here because
        // if the app started from a command line, like cmd or powershell,
        // it will attach sucessfully which is what we want
        // but if we were started from something like explorer,
        // it will fail to attach console which is also what we want.
        let _ = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    }
}
