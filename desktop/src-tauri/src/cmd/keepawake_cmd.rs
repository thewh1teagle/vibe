//! Tauri commands for taking and dropping keep-awake holds.
//!
//! Holds are named by the caller so that overlapping ones do not fight; see
//! `crate::keepawake`.

use tauri::State;

use crate::keepawake::{Flags, KeepAwake};

#[tauri::command]
pub fn keepawake_start(state: State<'_, KeepAwake>, tag: String, flags: Flags) {
    state.hold(tag, flags);
}

#[tauri::command]
pub fn keepawake_stop(state: State<'_, KeepAwake>, tag: String) {
    state.release(&tag);
}
