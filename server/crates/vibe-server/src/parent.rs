pub fn watch() {
    #[cfg(unix)]
    {
        let parent = unsafe { libc::getppid() };
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if unsafe { libc::getppid() } != parent {
                std::process::exit(0);
            }
        });
    }

    #[cfg(windows)]
    std::thread::spawn(windows::watch_parent);
}

#[cfg(windows)]
mod windows {
    use std::io;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, WAIT_FAILED, WAIT_OBJECT_0};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
    };

    pub(super) fn watch_parent() {
        let parent_pid = match parent_process_id() {
            Ok(parent_pid) => parent_pid,
            Err(error) => {
                eprintln!("warning: failed to identify parent process: {error}");
                return;
            }
        };

        let parent = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, parent_pid) };
        if parent.is_null() {
            // The parent most likely exited between taking the snapshot and
            // opening its handle. Honor --exit-with-parent in that race.
            let error = io::Error::last_os_error();
            eprintln!("warning: failed to open parent process {parent_pid}: {error}");
            std::process::exit(0);
        }

        let result = unsafe { WaitForSingleObject(parent, INFINITE) };
        unsafe {
            CloseHandle(parent);
        }
        match result {
            WAIT_OBJECT_0 => std::process::exit(0),
            WAIT_FAILED => eprintln!(
                "warning: failed while waiting for parent process {parent_pid}: {}",
                io::Error::last_os_error()
            ),
            result => eprintln!("warning: unexpected result while waiting for parent process {parent_pid}: {result}"),
        }
    }

    fn parent_process_id() -> io::Result<u32> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }

        let current_pid = unsafe { GetCurrentProcessId() };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let result = if unsafe { Process32FirstW(snapshot, &mut entry) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            loop {
                if entry.th32ProcessID == current_pid {
                    break Ok(entry.th32ParentProcessID);
                }
                if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                    break Err(io::Error::new(
                        io::ErrorKind::NotFound,
                        "current process missing from snapshot",
                    ));
                }
            }
        };
        unsafe {
            CloseHandle(snapshot);
        }
        result
    }
}
