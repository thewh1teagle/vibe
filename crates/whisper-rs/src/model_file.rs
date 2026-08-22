//! Pre-flight checks that run before a model file is handed to whisper.cpp.
//!
//! whisper.cpp reports most of these problems through `GGML_ASSERT`, which
//! aborts the process without producing an error, so the equivalent checks are
//! mirrored here in Rust and reported as ordinary errors instead.

use std::io::Read;
use std::path::Path;

use crate::{Error, Result};

/// `GGML_FILE_MAGIC` -- "ggml" in little endian.
const GGML_FILE_MAGIC: u32 = 0x6767_6d6c;
/// `GGML_QNT_VERSION_FACTOR`; the quantization version is folded into `ftype`.
const QNT_VERSION_FACTOR: i32 = 1000;
/// Magic, the eleven `whisper_hparams` fields, and the mel filter dimensions.
const HEADER_LEN: usize = 4 * (1 + 11 + 2);

/// `ftype` values that `ggml_ftype_to_ggml_type` maps to a real tensor type.
/// Anything else trips `GGML_ASSERT(wtype != GGML_TYPE_COUNT)` inside ggml.
const KNOWN_FTYPES: &[i32] = &[
    0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
];

/// Checks that `path` looks like a whisper.cpp GGML model and returns its size.
pub(crate) fn validate(path: &Path) -> Result<u64> {
    let size = std::fs::metadata(path)
        .map_err(|source| Error::ReadModel {
            path: path.to_path_buf(),
            source,
        })?
        .len();
    if size == 0 {
        return Err(Error::EmptyModel(path.to_path_buf()));
    }
    if size < HEADER_LEN as u64 {
        return Err(corrupt(path, size, "file is shorter than the model header"));
    }

    let buffer = read_header(path)?;
    let header: Vec<i32> = buffer
        .chunks_exact(4)
        .map(|word| i32::from_le_bytes([word[0], word[1], word[2], word[3]]))
        .collect();
    let magic = header[0] as u32;
    if magic != GGML_FILE_MAGIC {
        return Err(corrupt(path, size, &format!("bad magic 0x{magic:08x}")));
    }

    if let Some(kind) = other_ggml_model(&buffer) {
        return Err(Error::NotATranscriptionModel {
            path: path.to_path_buf(),
            kind,
        });
    }

    // Field order matches `whisper_model_load`: the eleven hparams, then the
    // mel filter dimensions.
    let n_vocab = header[1];
    let n_audio_layer = header[5];
    let n_text_state = header[7];
    let n_mels = header[10];
    let n_mel = header[12];
    let n_fft = header[13];

    // whisper.cpp strips the quantization version before looking up the type.
    let ftype = header[11].rem_euclid(QNT_VERSION_FACTOR);
    if !KNOWN_FTYPES.contains(&ftype) {
        return Err(Error::UnsupportedFtype {
            path: path.to_path_buf(),
            ftype,
        });
    }

    for (name, value) in [
        ("n_vocab", n_vocab),
        ("n_audio_layer", n_audio_layer),
        ("n_text_state", n_text_state),
        ("n_mels", n_mels),
        ("n_mel", n_mel),
        ("n_fft", n_fft),
    ] {
        if value <= 0 {
            return Err(corrupt(path, size, &format!("{name} is {value}")));
        }
    }

    // The mel filters and the token embedding always follow the header, so a
    // file smaller than those cannot be complete. Four bits per weight is the
    // smallest quantization ggml supports, which keeps this a lower bound.
    let mel_bytes = (n_mel as u64) * (n_fft as u64) * 4;
    let embedding_bytes = (n_vocab as u64) * (n_text_state as u64) / 2;
    let minimum = HEADER_LEN as u64 + mel_bytes + embedding_bytes;
    if size < minimum {
        return Err(corrupt(
            path,
            size,
            &format!("truncated file, expected at least {minimum} bytes"),
        ));
    }

    Ok(size)
}

fn read_header(path: &Path) -> Result<[u8; HEADER_LEN]> {
    let mut buffer = [0u8; HEADER_LEN];
    let mut file = std::fs::File::open(path).map_err(|source| Error::ReadModel {
        path: path.to_path_buf(),
        source,
    })?;
    file.read_exact(&mut buffer).map_err(|source| Error::ReadModel {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(buffer)
}

/// Other whisper.cpp model kinds reuse the GGML magic and follow it with a
/// length-prefixed name -- the Silero VAD models shipped alongside whisper
/// models are the common case. Whisper models put `n_vocab` in that slot, so a
/// small length followed by printable text means this is not one.
fn other_ggml_model(buffer: &[u8]) -> Option<String> {
    let length = i32::from_le_bytes([buffer[4], buffer[5], buffer[6], buffer[7]]);
    let end = 8 + usize::try_from(length).ok()?;
    if length <= 0 || end > buffer.len() {
        return None;
    }

    let name = std::str::from_utf8(&buffer[8..end]).ok()?;
    name.chars()
        .all(|character| character.is_ascii_graphic() || character == ' ')
        .then(|| name.to_string())
}

/// Warns, or fails when the model obviously cannot fit in memory.
///
/// whisper.cpp reads the weights into a single backend buffer, so the model
/// file size is a good estimate of the load. Available memory is only a
/// snapshot and the OS may still page or swap, so this only rejects a load when
/// the shortfall leaves no doubt.
pub(crate) fn check_available_memory(path: &Path, size: u64) -> Result<()> {
    let available = available_memory();
    if available == 0 {
        return Ok(());
    }
    if size / 2 > available {
        return Err(Error::InsufficientMemory {
            path: path.to_path_buf(),
            required: size,
            available,
        });
    }
    if size > available {
        eprintln!(
            "whisper: model {} needs about {size} bytes but only {available} bytes are available; loading may fail",
            path.display()
        );
    }
    Ok(())
}

fn available_memory() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.available_memory()
}

fn corrupt(path: &Path, size: u64, reason: &str) -> Error {
    Error::CorruptModel {
        path: path.to_path_buf(),
        size,
        reason: reason.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model_bytes(ftype: i32, trailing: usize) -> Vec<u8> {
        // n_vocab, n_audio_ctx, n_audio_state, n_audio_head, n_audio_layer,
        // n_text_ctx, n_text_state, n_text_head, n_text_layer, n_mels, ftype,
        // followed by the mel filter dimensions.
        let header: [i32; 14] = [
            GGML_FILE_MAGIC as i32,
            51865,
            1500,
            384,
            6,
            4,
            448,
            384,
            6,
            4,
            80,
            ftype,
            80,
            201,
        ];
        let mut bytes: Vec<u8> = header.iter().flat_map(|word| word.to_le_bytes()).collect();
        bytes.resize(bytes.len() + trailing, 0);
        bytes
    }

    fn write(bytes: &[u8]) -> tempfile::NamedTempFile {
        use std::io::Write;

        let mut file = tempfile::NamedTempFile::new().expect("temp file");
        file.write_all(bytes).expect("write model");
        file.flush().expect("flush model");
        file
    }

    #[test]
    fn accepts_a_plausible_model() {
        let file = write(&model_bytes(1, 64 << 20));
        assert!(validate(file.path()).is_ok());
    }

    #[test]
    fn rejects_an_empty_file() {
        let file = write(&[]);
        assert!(matches!(validate(file.path()), Err(Error::EmptyModel(_))));
    }

    #[test]
    fn rejects_a_silero_vad_model() {
        // Silero VAD models reuse the GGML magic and follow it with a
        // length-prefixed model type.
        let mut bytes: Vec<u8> = GGML_FILE_MAGIC.to_le_bytes().to_vec();
        bytes.extend_from_slice(&10i32.to_le_bytes());
        bytes.extend_from_slice(b"silero-16k");
        bytes.resize(1 << 20, 0);
        let file = write(&bytes);
        let error = validate(file.path());
        assert!(matches!(error, Err(Error::NotATranscriptionModel { ref kind, .. }) if kind == "silero-16k"), "{error:?}");
    }

    #[test]
    fn rejects_a_bad_magic() {
        let mut bytes = model_bytes(1, 64 << 20);
        bytes[..4].copy_from_slice(&0u32.to_le_bytes());
        let file = write(&bytes);
        assert!(matches!(validate(file.path()), Err(Error::CorruptModel { .. })));
    }

    #[test]
    fn rejects_an_unknown_ftype() {
        // 4 is GGML_FTYPE_MOSTLY_Q4_1_SOME_F16, which ggml maps to GGML_TYPE_COUNT.
        let file = write(&model_bytes(4, 64 << 20));
        assert!(matches!(validate(file.path()), Err(Error::UnsupportedFtype { ftype: 4, .. })));
    }

    #[test]
    fn keeps_the_quantization_version_out_of_the_ftype() {
        let file = write(&model_bytes(2 * QNT_VERSION_FACTOR + 1, 64 << 20));
        assert!(validate(file.path()).is_ok());
    }

    #[test]
    fn accepts_a_model_that_fits_in_memory() {
        assert!(check_available_memory(Path::new("model.bin"), 1 << 20).is_ok());
    }

    #[test]
    fn rejects_a_model_far_larger_than_memory() {
        let error = check_available_memory(Path::new("model.bin"), u64::MAX / 2);
        assert!(matches!(error, Err(Error::InsufficientMemory { .. })));
    }

    #[test]
    fn rejects_a_truncated_file() {
        let file = write(&model_bytes(1, 4096));
        assert!(matches!(validate(file.path()), Err(Error::CorruptModel { .. })));
    }
}
