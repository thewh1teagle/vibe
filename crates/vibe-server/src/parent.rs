pub async fn watch_parent() {
    loop {
        #[cfg(unix)]
        {
            if unsafe { libc_parent_pid() } == 1 {
                std::process::exit(0);
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

#[cfg(unix)]
unsafe fn libc_parent_pid() -> i32 {
    unsafe extern "C" {
        fn getppid() -> i32;
    }
    unsafe { getppid() }
}
