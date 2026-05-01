use whisper_rs::TranscribeOptions;

use crate::transcription::form::RequestForm;

pub fn from_form(form: &RequestForm) -> TranscribeOptions {
    TranscribeOptions {
        language: form.language.clone(),
        detect_language: form.detect_language,
        translate: form.translate,
        threads: form.n_threads,
        prompt: form.prompt.clone(),
        temperature: form.temperature,
        max_text_ctx: form.max_text_ctx,
        word_timestamps: form.word_timestamps,
        max_segment_len: form.max_segment_len,
        sampling_greedy: form.sampling_strategy != "beam_search",
        best_of: form.best_of,
        beam_size: form.beam_size,
        stable_timestamps: form.stable_timestamps,
        vad_model_path: form.vad_model.clone(),
        ..Default::default()
    }
}
