use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy::*};

pub fn set_dock_visible(visible: bool) {
    let policy = if visible {
        NSApplicationActivationPolicyRegular
    } else {
        NSApplicationActivationPolicyAccessory
    };
    unsafe {
        let app = NSApp();
        app.setActivationPolicy_(policy);
    }
}
