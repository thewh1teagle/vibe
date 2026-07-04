use std::ffi::c_void;

use crate::{Segment, StreamCallbacks, ffi};

pub(crate) struct CallbackState<'a> {
    pub callbacks: StreamCallbacks<'a>,
    pub aborted: bool,
}

impl<'a> CallbackState<'a> {
    pub fn new(callbacks: StreamCallbacks<'a>) -> Self {
        Self {
            callbacks,
            aborted: false,
        }
    }

    pub fn has_callbacks(&self) -> bool {
        self.callbacks.on_progress.is_some()
            || self.callbacks.on_segment.is_some()
            || self.callbacks.should_abort.is_some()
    }

    pub fn should_abort(&mut self) -> bool {
        if let Some(should_abort) = self.callbacks.should_abort.as_mut() {
            self.aborted = should_abort();
            return self.aborted;
        }
        false
    }
}

pub(crate) fn install_stream_callbacks(
    params: &mut ffi::whisper_full_params,
    state: &mut CallbackState<'_>,
) {
    if !state.has_callbacks() {
        return;
    }

    let user_data = (state as *mut CallbackState<'_>).cast::<c_void>();
    params.progress_callback = Some(progress_callback);
    params.progress_callback_user_data = user_data;
    params.new_segment_callback = Some(new_segment_callback);
    params.new_segment_callback_user_data = user_data;
    params.abort_callback = Some(abort_callback);
    params.abort_callback_user_data = user_data;
}

pub(crate) fn install_abort_callback(
    params: &mut ffi::whisper_full_params,
    state: &mut CallbackState<'_>,
) {
    if state.callbacks.should_abort.is_none() {
        return;
    }

    params.abort_callback = Some(abort_callback);
    params.abort_callback_user_data = (state as *mut CallbackState<'_>).cast::<c_void>();
}

extern "C" fn progress_callback(
    _ctx: *mut ffi::whisper_context,
    _state: *mut ffi::whisper_state,
    progress: i32,
    user_data: *mut c_void,
) {
    let Some(state) = callback_state(user_data) else {
        return;
    };
    if let Some(on_progress) = state.callbacks.on_progress.as_mut() {
        on_progress(progress);
    }
}

extern "C" fn new_segment_callback(
    ctx: *mut ffi::whisper_context,
    _state: *mut ffi::whisper_state,
    n_new: i32,
    user_data: *mut c_void,
) {
    let Some(state) = callback_state(user_data) else {
        return;
    };
    if let Some(on_segment) = state.callbacks.on_segment.as_mut() {
        let n_segments = unsafe { ffi::whisper_full_n_segments(ctx) };
        for index in (n_segments - n_new).max(0)..n_segments {
            on_segment(segment_at(ctx, index));
        }
    }
}

extern "C" fn abort_callback(user_data: *mut c_void) -> bool {
    let Some(state) = callback_state(user_data) else {
        return false;
    };
    state.should_abort()
}

fn callback_state<'a>(user_data: *mut c_void) -> Option<&'a mut CallbackState<'a>> {
    if user_data.is_null() {
        return None;
    }
    Some(unsafe { &mut *user_data.cast::<CallbackState<'a>>() })
}

fn segment_at(ctx: *mut ffi::whisper_context, index: i32) -> Segment {
    let text_ptr = unsafe { ffi::whisper_full_get_segment_text(ctx, index) };
    let text = if text_ptr.is_null() {
        String::new()
    } else {
        unsafe { std::ffi::CStr::from_ptr(text_ptr) }
            .to_string_lossy()
            .into_owned()
    };

    Segment {
        start: unsafe { ffi::whisper_full_get_segment_t0(ctx, index) },
        end: unsafe { ffi::whisper_full_get_segment_t1(ctx, index) },
        text,
        no_speech_prob: unsafe { ffi::whisper_full_get_segment_no_speech_prob(ctx, index) },
    }
}
