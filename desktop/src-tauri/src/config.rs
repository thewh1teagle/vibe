pub const LOG_FILENAME_PREFIX: &str = "log";
pub const LOG_FILENAME_SUFFIX: &str = ".txt";
pub const DEFAULT_LOG_DIRECTIVE: &str = "vibe=DEBUG,vibe_core=DEBUG,whisper_rs=INFO";
pub const STORE_FILENAME: &str = "app_config.json";
pub const DEFAULT_MODEL_URLS: &[&str] = &[
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q8_0.bin",
    "https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/ggml-medium-q8_0.bin",
];
pub const DEAFULT_MODEL_FILENAME: &str = "ggml-medium-q8_0.bin";

// Diarization
pub const SEGMENT_MODEL_FILENAME: &str = "segmentation-3.0.onnx";
pub const EMBEDDING_MODEL_FILENAME: &str = "wespeaker_en_voxceleb_CAM++.onnx";
