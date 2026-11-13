//! Getting a Zipformer GGUF off disk: the tensor catalog, dequantized copies
//! for the host-side decoder, metadata accessors, and the upload of the
//! encoder weights to a GPU backend.
//!
//! Nothing here runs a graph; inference lives in [`crate::encoder`].

use std::ffi::{CStr, CString};
use std::path::Path;
use std::ptr;

use crate::{sys, Error, Result};

const ARCHITECTURE: &str = "zipformer2";
const DEVICE_PREFIXES: [&str; 2] = ["embed.", "enc."];

/// The GGUF and the GGML context that owns its tensor data. Tensor pointers
/// handed out by [`Weights::tensor`] stay valid for as long as this lives.
pub(crate) struct Weights {
    gguf: *mut sys::gguf_context,
    ctx: *mut sys::ggml_context,
}

unsafe impl Send for Weights {}
unsafe impl Sync for Weights {}

impl Drop for Weights {
    fn drop(&mut self) {
        unsafe {
            sys::ggml_free(self.ctx);
            sys::gguf_free(self.gguf);
        }
    }
}

impl Weights {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        Self::read(path, false)
    }

    /// Reads the metadata and tensor catalog only; no tensor has data.
    pub(crate) fn open_metadata(path: &Path) -> Result<Self> {
        Self::read(path, true)
    }

    fn read(path: &Path, no_alloc: bool) -> Result<Self> {
        let c_path = CString::new(path.to_string_lossy().as_bytes()).map_err(|_| Error::InvalidPath)?;
        let mut ctx = ptr::null_mut();
        let gguf = unsafe { sys::gguf_init_from_file(c_path.as_ptr(), sys::gguf_init_params { no_alloc, ctx: &mut ctx }) };
        if gguf.is_null() || ctx.is_null() {
            if !gguf.is_null() {
                unsafe { sys::gguf_free(gguf) };
            }
            return Err(Error::Load(path.display().to_string()));
        }
        let weights = Self { gguf, ctx };
        let architecture = weights.meta_str("general.architecture")?;
        if architecture != ARCHITECTURE {
            return Err(Error::UnsupportedArchitecture(architecture));
        }
        Ok(weights)
    }

    pub(crate) fn tensor(&self, name: &str) -> Result<*mut sys::ggml_tensor> {
        lookup(self.ctx, name).ok_or_else(|| Error::MissingTensor(name.to_owned()))
    }

    /// Dequantized copy of a tensor. The shape is in the spec's (PyTorch)
    /// order, the reverse of GGML's `ne`, and the data is row-major in that
    /// order: a Linear `[out, in]` reads `data[o * in + i]`.
    pub(crate) fn f32(&self, name: &str) -> Result<(Vec<usize>, Vec<f32>)> {
        let tensor = self.tensor(name)?;
        unsafe {
            let dims = sys::ggml_n_dims(tensor) as usize;
            let ne = (*tensor).ne;
            let shape = ne[..dims].iter().rev().map(|&dim| dim as usize).collect();
            let count = sys::ggml_nelements(tensor) as usize;
            let mut data = vec![0.0f32; count];
            if (*tensor).type_ == sys::ggml_type_GGML_TYPE_F32 {
                ptr::copy_nonoverlapping((*tensor).data.cast::<f32>(), data.as_mut_ptr(), count);
            } else {
                let traits = sys::ggml_get_type_traits((*tensor).type_);
                let to_float = traits
                    .as_ref()
                    .and_then(|traits| traits.to_float)
                    .ok_or(Error::Ggml("tensor type has no float conversion"))?;
                to_float((*tensor).data, data.as_mut_ptr(), count as i64);
            }
            Ok((shape, data))
        }
    }

    pub(crate) fn meta_u32(&self, key: &'static str) -> Result<u32> {
        let value = self.meta_i64(key)?;
        u32::try_from(value).map_err(|_| invalid(key, format!("{value} is not an unsigned 32-bit value")))
    }

    pub(crate) fn meta_f32(&self, key: &'static str) -> Result<f32> {
        let id = self.key(key)?;
        unsafe {
            match sys::gguf_get_kv_type(self.gguf, id) {
                sys::gguf_type_GGUF_TYPE_FLOAT32 => Ok(sys::gguf_get_val_f32(self.gguf, id)),
                sys::gguf_type_GGUF_TYPE_FLOAT64 => Ok(sys::gguf_get_val_f64(self.gguf, id) as f32),
                _ => self.meta_i64(key).map(|value| value as f32),
            }
        }
    }

    pub(crate) fn meta_str(&self, key: &'static str) -> Result<String> {
        let id = self.key(key)?;
        unsafe {
            if sys::gguf_get_kv_type(self.gguf, id) != sys::gguf_type_GGUF_TYPE_STRING {
                return Err(invalid(key, "not a string".into()));
            }
            Ok(CStr::from_ptr(sys::gguf_get_val_str(self.gguf, id))
                .to_string_lossy()
                .into_owned())
        }
    }

    pub(crate) fn meta_strs(&self, key: &'static str) -> Result<Vec<String>> {
        let id = self.array(key, &[sys::gguf_type_GGUF_TYPE_STRING])?;
        unsafe {
            Ok((0..sys::gguf_get_arr_n(self.gguf, id))
                .map(|index| {
                    CStr::from_ptr(sys::gguf_get_arr_str(self.gguf, id, index))
                        .to_string_lossy()
                        .into_owned()
                })
                .collect())
        }
    }

    pub(crate) fn meta_i32s(&self, key: &'static str) -> Result<Vec<i32>> {
        let id = self.array(key, &[sys::gguf_type_GGUF_TYPE_INT32, sys::gguf_type_GGUF_TYPE_UINT32])?;
        unsafe {
            let count = sys::gguf_get_arr_n(self.gguf, id);
            let data = sys::gguf_get_arr_data(self.gguf, id).cast::<i32>();
            if data.is_null() {
                return Ok(Vec::new());
            }
            Ok(std::slice::from_raw_parts(data, count).to_vec())
        }
    }

    fn meta_i64(&self, key: &'static str) -> Result<i64> {
        let id = self.key(key)?;
        unsafe {
            match sys::gguf_get_kv_type(self.gguf, id) {
                sys::gguf_type_GGUF_TYPE_UINT8 => Ok(sys::gguf_get_val_u8(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_INT8 => Ok(sys::gguf_get_val_i8(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_UINT16 => Ok(sys::gguf_get_val_u16(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_INT16 => Ok(sys::gguf_get_val_i16(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_UINT32 => Ok(sys::gguf_get_val_u32(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_INT32 => Ok(sys::gguf_get_val_i32(self.gguf, id) as i64),
                sys::gguf_type_GGUF_TYPE_INT64 => Ok(sys::gguf_get_val_i64(self.gguf, id)),
                sys::gguf_type_GGUF_TYPE_UINT64 => {
                    i64::try_from(sys::gguf_get_val_u64(self.gguf, id)).map_err(|_| invalid(key, "out of range".into()))
                }
                sys::gguf_type_GGUF_TYPE_BOOL => Ok(sys::gguf_get_val_bool(self.gguf, id) as i64),
                _ => Err(invalid(key, "not an integer".into())),
            }
        }
    }

    fn key(&self, key: &'static str) -> Result<i64> {
        let name = CString::new(key).map_err(|_| Error::MissingMetadata(key))?;
        let id = unsafe { sys::gguf_find_key(self.gguf, name.as_ptr()) };
        (id >= 0).then_some(id).ok_or(Error::MissingMetadata(key))
    }

    fn array(&self, key: &'static str, element_types: &[sys::gguf_type]) -> Result<i64> {
        let id = self.key(key)?;
        unsafe {
            if sys::gguf_get_kv_type(self.gguf, id) != sys::gguf_type_GGUF_TYPE_ARRAY {
                return Err(invalid(key, "not an array".into()));
            }
            if !element_types.contains(&sys::gguf_get_arr_type(self.gguf, id)) {
                return Err(invalid(key, "unexpected array element type".into()));
            }
        }
        Ok(id)
    }

    /// Copies the encoder tensors to the first GPU backend, or returns `None`
    /// when the machine has none. The decoder and joiner stay on the host.
    pub(crate) fn upload(&self) -> Result<Option<DeviceWeights>> {
        unsafe {
            sys::ggml_backend_load_all();
            let mut backend =
                sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU, ptr::null());
            if backend.is_null() {
                backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU, ptr::null());
            }
            if backend.is_null() {
                return Ok(None);
            }
            let sources = self.device_tensors();
            let ctx = sys::ggml_init(sys::ggml_init_params {
                mem_size: sys::ggml_tensor_overhead() * (sources.len() + 32),
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            });
            if ctx.is_null() {
                sys::ggml_backend_free(backend);
                return Err(Error::Ggml("device weight context"));
            }
            let copies = sources
                .iter()
                .map(|&source| {
                    let copy = sys::ggml_dup_tensor(ctx, source);
                    sys::ggml_set_name(copy, sys::ggml_get_name(source));
                    copy
                })
                .collect::<Vec<_>>();
            let buffer = sys::ggml_backend_alloc_ctx_tensors(ctx, backend);
            if buffer.is_null() {
                sys::ggml_free(ctx);
                sys::ggml_backend_free(backend);
                return Err(Error::Ggml("device weight buffer"));
            }
            for (&source, &copy) in sources.iter().zip(&copies) {
                sys::ggml_backend_tensor_set(copy, (*source).data, 0, sys::ggml_nbytes(source));
            }
            Ok(Some(DeviceWeights { ctx, buffer, backend }))
        }
    }

    unsafe fn device_tensors(&self) -> Vec<*mut sys::ggml_tensor> {
        let mut tensors = Vec::new();
        let mut tensor = sys::ggml_get_first_tensor(self.ctx);
        while !tensor.is_null() {
            let name = CStr::from_ptr(sys::ggml_get_name(tensor)).to_bytes();
            if DEVICE_PREFIXES.iter().any(|prefix| name.starts_with(prefix.as_bytes())) {
                tensors.push(tensor);
            }
            tensor = sys::ggml_get_next_tensor(self.ctx, tensor);
        }
        tensors
    }
}

/// The encoder tensors as they live on a GPU backend, with the backend itself.
pub(crate) struct DeviceWeights {
    ctx: *mut sys::ggml_context,
    buffer: sys::ggml_backend_buffer_t,
    pub(crate) backend: sys::ggml_backend_t,
}

impl DeviceWeights {
    pub(crate) fn tensor(&self, name: &str) -> Result<*mut sys::ggml_tensor> {
        lookup(self.ctx, name).ok_or_else(|| Error::MissingTensor(name.to_owned()))
    }
}

impl Drop for DeviceWeights {
    fn drop(&mut self) {
        unsafe {
            sys::ggml_backend_buffer_free(self.buffer);
            sys::ggml_free(self.ctx);
            sys::ggml_backend_free(self.backend);
        }
    }
}

fn lookup(ctx: *mut sys::ggml_context, name: &str) -> Option<*mut sys::ggml_tensor> {
    let name = CString::new(name).ok()?;
    let tensor = unsafe { sys::ggml_get_tensor(ctx, name.as_ptr()) };
    (!tensor.is_null()).then_some(tensor)
}

fn invalid(key: &'static str, message: String) -> Error {
    Error::InvalidMetadata { key, message }
}
