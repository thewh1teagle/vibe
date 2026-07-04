#[cfg(windows)]
pub fn vulkan_available() -> bool {
    use windows_sys::Win32::Foundation::FreeLibrary;
    use windows_sys::Win32::System::LibraryLoader::LoadLibraryA;

    let handle = unsafe { LoadLibraryA(c"vulkan-1.dll".as_ptr().cast()) };
    if handle.is_null() {
        return false;
    }

    unsafe { FreeLibrary(handle) };
    true
}

#[cfg(not(windows))]
pub fn vulkan_available() -> bool {
    true
}
