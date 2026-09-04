//! Loader for whisper.cpp's Silero VAD binary model format.
//!
//! The file is the legacy ggml container written by
//! `models/convert-silero-vad-to-ggml.py` in whisper.cpp: a magic word, a
//! model-type string, version and window header, hyper-parameters, then a
//! sequence of named tensors. The parse mirrors
//! `whisper_vad_init_with_params` (whisper.cpp:4775) field for field.

use std::collections::HashMap;
use std::path::Path;

use ggml_rs_sys as sys;

pub(crate) type Tensor = *mut sys::ggml_tensor;

/// `GGML_FILE_MAGIC` — the bytes "lmgg" little-endian.
const FILE_MAGIC: u32 = 0x6767_6d6c;

const ENCODER_LAYERS: usize = 4;

pub(crate) struct Hparams {
    pub n_window: i32,
    pub encoder_out_channels: [i32; ENCODER_LAYERS],
    pub lstm_hidden_size: i32,
    /// Doubles as the STFT hop size in the whisper.cpp graph.
    pub lstm_input_size: i32,
}

/// The model tensors, resident in a CPU ggml context that owns their data.
pub(crate) struct Model {
    ctx: *mut sys::ggml_context,
    pub hparams: Hparams,
    pub stft_basis: Tensor,
    pub encoder: [(Tensor, Tensor); ENCODER_LAYERS],
    pub lstm_ih_weight: Tensor,
    pub lstm_ih_bias: Tensor,
    pub lstm_hh_weight: Tensor,
    pub lstm_hh_bias: Tensor,
    pub final_conv_weight: Tensor,
    pub final_conv_bias: Tensor,
}

// The context is only touched behind &mut on one thread at a time, matching
// the contract diarize-rs uses for its weight context.
unsafe impl Send for Model {}

impl Drop for Model {
    fn drop(&mut self) {
        unsafe { sys::ggml_free(self.ctx) };
    }
}

struct Cursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn read_bytes(&mut self, len: usize) -> Option<&'a [u8]> {
        let bytes = self.data.get(self.pos..self.pos + len)?;
        self.pos += len;
        Some(bytes)
    }

    fn read_i32(&mut self) -> Option<i32> {
        Some(i32::from_le_bytes(self.read_bytes(4)?.try_into().ok()?))
    }

    fn at_end(&self) -> bool {
        self.pos >= self.data.len()
    }
}

struct TensorRecord<'a> {
    name: &'a str,
    kind: sys::ggml_type,
    ne: [i64; 4],
    data: &'a [u8],
}

impl Model {
    pub(crate) fn load(path: &Path) -> Option<Self> {
        let bytes = std::fs::read(path).ok()?;
        let mut cursor = Cursor { data: &bytes, pos: 0 };

        if cursor.read_i32()? as u32 != FILE_MAGIC {
            return None;
        }

        // Model type string, version triple, and the analysis window sizes.
        let type_len = usize::try_from(cursor.read_i32()?).ok()?;
        cursor.read_bytes(type_len)?;
        for _ in 0..3 {
            cursor.read_i32()?; // major, minor, patch
        }
        let n_window = cursor.read_i32()?;
        cursor.read_i32()?; // n_context; the graph hardcodes the 64-sample reflect pad

        let n_encoder_layers = cursor.read_i32()?;
        if n_encoder_layers != ENCODER_LAYERS as i32 {
            return None;
        }
        let mut encoder_out_channels = [0i32; ENCODER_LAYERS];
        for out_channels in &mut encoder_out_channels {
            cursor.read_i32()?; // in channels
            *out_channels = cursor.read_i32()?;
            cursor.read_i32()?; // kernel size
        }
        let lstm_input_size = cursor.read_i32()?;
        let lstm_hidden_size = cursor.read_i32()?;
        cursor.read_i32()?; // final_conv_in
        cursor.read_i32()?; // final_conv_out

        let records = read_tensor_records(&mut cursor)?;
        let ctx = create_context(&records)?;
        let model = (|| {
            let tensors = unsafe { upload_tensors(ctx, &records) }?;
            let encoder_pair = |layer: usize| {
                Some((
                    *tensors.get(format!("_model.encoder.{layer}.reparam_conv.weight").as_str())?,
                    *tensors.get(format!("_model.encoder.{layer}.reparam_conv.bias").as_str())?,
                ))
            };
            Some(Self {
                ctx,
                hparams: Hparams {
                    n_window,
                    encoder_out_channels,
                    lstm_hidden_size,
                    lstm_input_size,
                },
                stft_basis: *tensors.get("_model.stft.forward_basis_buffer")?,
                encoder: [encoder_pair(0)?, encoder_pair(1)?, encoder_pair(2)?, encoder_pair(3)?],
                lstm_ih_weight: *tensors.get("_model.decoder.rnn.weight_ih")?,
                lstm_ih_bias: *tensors.get("_model.decoder.rnn.bias_ih")?,
                lstm_hh_weight: *tensors.get("_model.decoder.rnn.weight_hh")?,
                lstm_hh_bias: *tensors.get("_model.decoder.rnn.bias_hh")?,
                final_conv_weight: *tensors.get("_model.decoder.decoder.2.weight")?,
                final_conv_bias: *tensors.get("_model.decoder.decoder.2.bias")?,
            })
        })();
        if model.is_none() {
            unsafe { sys::ggml_free(ctx) };
        }
        model
    }
}

fn read_tensor_records<'a>(cursor: &mut Cursor<'a>) -> Option<Vec<TensorRecord<'a>>> {
    let mut records = Vec::new();
    while !cursor.at_end() {
        let n_dims = usize::try_from(cursor.read_i32()?).ok()?;
        let name_len = usize::try_from(cursor.read_i32()?).ok()?;
        let ttype = cursor.read_i32()?;
        if n_dims > 4 {
            return None;
        }
        let mut ne = [1i64; 4];
        let mut nelements = 1i64;
        for dim in ne.iter_mut().take(n_dims) {
            *dim = i64::from(cursor.read_i32()?);
            nelements = nelements.checked_mul(*dim)?;
        }
        let name = std::str::from_utf8(cursor.read_bytes(name_len)?).ok()?;
        let (kind, element_size) = match ttype {
            0 => (sys::ggml_type_GGML_TYPE_F32, 4usize),
            1 => (sys::ggml_type_GGML_TYPE_F16, 2usize),
            _ => return None,
        };
        let data = cursor.read_bytes(usize::try_from(nelements).ok()?.checked_mul(element_size)?)?;
        records.push(TensorRecord { name, kind, ne, data });
    }
    Some(records)
}

fn create_context(records: &[TensorRecord<'_>]) -> Option<*mut sys::ggml_context> {
    let overhead = unsafe { sys::ggml_tensor_overhead() };
    let mem_size = records
        .iter()
        // Round each tensor's data up to ggml's 16-byte object alignment.
        .map(|record| record.data.len().div_ceil(16) * 16 + overhead)
        .sum::<usize>()
        + 4096;
    let ctx = unsafe {
        sys::ggml_init(sys::ggml_init_params {
            mem_size,
            mem_buffer: std::ptr::null_mut(),
            no_alloc: false,
        })
    };
    if ctx.is_null() {
        return None;
    }
    Some(ctx)
}

unsafe fn upload_tensors<'a>(
    ctx: *mut sys::ggml_context,
    records: &'a [TensorRecord<'_>],
) -> Option<HashMap<&'a str, Tensor>> {
    let mut tensors = HashMap::new();
    for record in records {
        let tensor = sys::ggml_new_tensor(ctx, record.kind, 4, record.ne.as_ptr());
        if tensor.is_null() || sys::ggml_nbytes(tensor) != record.data.len() {
            return None;
        }
        std::ptr::copy_nonoverlapping(record.data.as_ptr(), (*tensor).data.cast::<u8>(), record.data.len());
        tensors.insert(record.name, tensor);
    }
    Some(tensors)
}
