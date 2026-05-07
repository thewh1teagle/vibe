#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
#[cfg(target_os = "windows")]
use tauri::{AppHandle, Emitter};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{VK_CONTROL, VK_RCONTROL};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, MSG,
    WH_KEYBOARD_LL, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

#[cfg(target_os = "windows")]
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
#[cfg(target_os = "windows")]
static RCTRL_PRESSED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static HOOK_HANDLE: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(std::ptr::null_mut());

#[cfg(target_os = "windows")]
unsafe extern "system" fn hook_callback(
    code: i32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if code >= 0 {
        let kb_struct = &*(lparam as *const KBDLLHOOKSTRUCT);
        let vk_code = kb_struct.vkCode as u32;
        let is_right_ctrl = vk_code == VK_RCONTROL as u32
            || (vk_code == VK_CONTROL as u32 && (kb_struct.flags & 1) != 0);

        if is_right_ctrl {
            let event_type = wparam as u32;
            match event_type {
                WM_KEYDOWN | WM_SYSKEYDOWN => {
                    if !RCTRL_PRESSED.swap(true, Ordering::SeqCst) {
                        if let Some(app) = APP_HANDLE.get() {
                            let _ = app.emit("native-shortcut-pressed", "RightControl");
                        }
                    }
                    return 1;
                }
                WM_KEYUP | WM_SYSKEYUP => {
                    RCTRL_PRESSED.store(false, Ordering::SeqCst);
                    if let Some(app) = APP_HANDLE.get() {
                        let _ = app.emit("native-shortcut-released", "RightControl");
                    }
                    return 1;
                }
                _ => {}
            }
        }
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

#[cfg(target_os = "windows")]
pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(hook_callback),
            std::ptr::null_mut(),
            0,
        );
        if hook.is_null() {
            tracing::error!("Failed to set keyboard hook");
            return;
        }
        HOOK_HANDLE.store(hook, Ordering::SeqCst);
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, HWND::default(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn init(_app: tauri::AppHandle) {}