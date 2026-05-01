#[derive(Debug, Clone)]
pub struct TranscribeOptions {
    pub language: String,
    pub detect_language: bool,
    pub translate: bool,
    pub threads: i32,
    pub prompt: String,
    pub temperature: f32,
    pub max_text_ctx: i32,
    pub word_timestamps: bool,
    pub max_segment_len: i32,
    pub sampling_greedy: bool,
    pub best_of: i32,
    pub beam_size: i32,
    pub print_progress: bool,
    pub print_special: bool,
    pub print_realtime: bool,
    pub print_timestamps: bool,
    pub stable_timestamps: bool,
    pub vad_model_path: String,
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self {
            language: String::new(),
            detect_language: false,
            translate: false,
            threads: 0,
            prompt: String::new(),
            temperature: 0.0,
            max_text_ctx: 0,
            word_timestamps: false,
            max_segment_len: 0,
            sampling_greedy: true,
            best_of: 0,
            beam_size: 0,
            print_progress: false,
            print_special: false,
            print_realtime: false,
            print_timestamps: false,
            stable_timestamps: false,
            vad_model_path: String::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Segment {
    pub start_cs: i64,
    pub end_cs: i64,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct TranscribeResult {
    pub segments: Vec<Segment>,
}

impl TranscribeResult {
    pub fn text(&self) -> String {
        self.segments.iter().map(|segment| segment.text.as_str()).collect()
    }
}

#[derive(Default)]
pub struct StreamCallbacks<'a> {
    pub on_progress: Option<Box<dyn FnMut(i32) + Send + 'a>>,
    pub on_segment: Option<Box<dyn FnMut(Segment) + Send + 'a>>,
    pub should_abort: Option<Box<dyn FnMut() -> bool + Send + 'a>>,
}
