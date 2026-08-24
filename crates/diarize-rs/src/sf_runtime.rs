//! Graph allocation and execution, ported from `crates/parakeet-rs/src/runtime.rs`.
//!
//! It is duplicated rather than shared because `parakeet_rs::runtime` is
//! `pub(crate)`; if the two crates are ever merged, delete this file and use
//! that one. The only behavioural difference is that a Sortformer chunk graph
//! is rebuilt per chunk, so [`Graph`] is cheap to drop and recreate.

use std::ptr;

use crate::sf_ops::sys;
use crate::sf_weights::{SfError, SfResult};

/// A compute backend plus its scratch allocator. `owned` distinguishes a CPU
/// backend we created from a GPU backend borrowed from the weight upload.
pub(crate) struct Runtime {
    backend: sys::ggml_backend_t,
    owned: bool,
}

impl Runtime {
    /// Use the backend the weights live on, or spin up a CPU backend.
    pub(crate) fn new(backend: sys::ggml_backend_t) -> SfResult<Self> {
        if !backend.is_null() {
            return Ok(Self { backend, owned: false });
        }
        let threads = std::env::var("DIARIZE_THREADS")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|threads| *threads > 0)
            .unwrap_or_else(|| {
                std::thread::available_parallelism()
                    .map(|count| (count.get() * 4 / 5).max(1))
                    .unwrap_or(4)
            });
        let backend = unsafe { sys::ggml_backend_cpu_init() };
        if backend.is_null() {
            return Err(SfError::Ggml("ggml_backend_cpu_init"));
        }
        unsafe { sys::ggml_backend_cpu_set_n_threads(backend, threads.min(i32::MAX as usize) as i32) };
        Ok(Self { backend, owned: true })
    }

    /// Allocate (once per graph), upload every input, and compute.
    pub(crate) unsafe fn execute(&self, graph: &mut Graph, inputs: &[(*mut sys::ggml_tensor, &[f32])]) -> SfResult<()> {
        for &(tensor, _) in inputs {
            sys::ggml_set_input(tensor);
        }
        if graph.allocator.is_null() {
            graph.allocator = sys::ggml_gallocr_new(sys::ggml_backend_get_default_buffer_type(self.backend));
            if graph.allocator.is_null() || !sys::ggml_gallocr_alloc_graph(graph.allocator, graph.graph) {
                return Err(SfError::Ggml("ggml_gallocr_alloc_graph"));
            }
        }
        for &(tensor, values) in inputs {
            sys::ggml_backend_tensor_set(tensor, values.as_ptr().cast(), 0, std::mem::size_of_val(values));
        }
        if sys::ggml_backend_graph_compute(self.backend, graph.graph) == sys::ggml_status_GGML_STATUS_SUCCESS {
            Ok(())
        } else {
            Err(SfError::Ggml("ggml graph compute"))
        }
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        if self.owned {
            unsafe { sys::ggml_backend_free(self.backend) };
        }
    }
}

/// A no-alloc GGML context plus the forward graph built inside it.
pub(crate) struct Graph {
    pub ctx: *mut sys::ggml_context,
    pub graph: *mut sys::ggml_cgraph,
    allocator: sys::ggml_gallocr_t,
}

impl Graph {
    pub fn new() -> SfResult<Self> {
        let ctx = unsafe {
            sys::ggml_init(sys::ggml_init_params {
                // 17 conformer + 18 transformer blocks over a ~1500-frame
                // concat; the C++ streaming path budgets 32 MiB for the same
                // graph (model.cpp:875).
                mem_size: 64 * 1024 * 1024,
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            })
        };
        if ctx.is_null() {
            return Err(SfError::Ggml("ggml_init"));
        }
        let graph = unsafe { sys::ggml_new_graph_custom(ctx, 8192, false) };
        if graph.is_null() {
            unsafe { sys::ggml_free(ctx) };
            return Err(SfError::Ggml("ggml_new_graph_custom"));
        }
        Ok(Self {
            ctx,
            graph,
            allocator: ptr::null_mut(),
        })
    }

    pub unsafe fn output(&mut self, tensor: *mut sys::ggml_tensor) {
        sys::ggml_set_output(tensor);
        sys::ggml_build_forward_expand(self.graph, tensor);
    }

    /// Copy a computed tensor back to the host as f32.
    pub unsafe fn read(&self, tensor: *mut sys::ggml_tensor) -> Vec<f32> {
        let count = sys::ggml_nelements(tensor) as usize;
        let mut data = vec![0.0f32; count];
        sys::ggml_backend_tensor_get(tensor, data.as_mut_ptr().cast(), 0, count * std::mem::size_of::<f32>());
        data
    }
}

impl Drop for Graph {
    fn drop(&mut self) {
        unsafe {
            if !self.allocator.is_null() {
                sys::ggml_gallocr_free(self.allocator);
            }
            sys::ggml_free(self.ctx);
        }
    }
}
