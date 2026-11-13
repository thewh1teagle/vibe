//! One GGML backend and the graphs that run on it.

use std::ffi::CStr;
use std::ptr;

use crate::{sys, Error, Result};

const GRAPH_NODES: usize = 16384;
const GRAPH_CONTEXT_BYTES: usize = 64 * 1024 * 1024;

pub(crate) struct Runtime {
    backend: sys::ggml_backend_t,
    owned: bool,
}

unsafe impl Send for Runtime {}

impl Runtime {
    /// A CPU backend with `ZIPFORMER_THREADS` threads, or four fifths of the
    /// machine's cores when that is not set.
    pub(crate) fn cpu() -> Result<Self> {
        let threads = std::env::var("ZIPFORMER_THREADS")
            .ok()
            .and_then(|value| value.parse().ok())
            .filter(|threads| *threads > 0)
            .unwrap_or_else(|| {
                std::thread::available_parallelism()
                    .map(|count| (count.get() * 4 / 5).max(1))
                    .unwrap_or(4)
            });
        let backend = unsafe { init_cpu_backend(threads.min(i32::MAX as usize) as i32) };
        if backend.is_null() {
            return Err(Error::Ggml("cpu backend init"));
        }
        Ok(Self { backend, owned: true })
    }

    /// Runs on a backend owned by the caller, which must outlive this.
    pub(crate) fn borrowed(backend: sys::ggml_backend_t) -> Self {
        Self { backend, owned: false }
    }

    pub(crate) fn is_cpu(&self) -> bool {
        self.owned
    }

    /// The operations in `graph` that this backend cannot run.
    pub(crate) unsafe fn unsupported(&self, graph: &Graph) -> Vec<String> {
        let mut missing = Vec::new();
        for index in 0..sys::ggml_graph_n_nodes(graph.graph) {
            let node = sys::ggml_graph_node(graph.graph, index);
            if !sys::ggml_backend_supports_op(self.backend, node) {
                let name = CStr::from_ptr(sys::ggml_op_desc(node)).to_string_lossy().into_owned();
                if !missing.contains(&name) {
                    missing.push(name);
                }
            }
        }
        missing
    }

    pub(crate) unsafe fn execute(&self, graph: &mut Graph, inputs: &[(*mut sys::ggml_tensor, Vec<f32>)]) -> Result<()> {
        for (tensor, _) in inputs {
            sys::ggml_set_input(*tensor);
        }
        if graph.allocator.is_null() {
            graph.allocator = sys::ggml_gallocr_new(sys::ggml_backend_get_default_buffer_type(self.backend));
            if graph.allocator.is_null() || !sys::ggml_gallocr_alloc_graph(graph.allocator, graph.graph) {
                return Err(Error::Ggml("ggml_gallocr_alloc_graph"));
            }
        }
        for (tensor, values) in inputs {
            if sys::ggml_nelements(*tensor) as usize != values.len() {
                return Err(Error::Ggml("graph input size mismatch"));
            }
            sys::ggml_backend_tensor_set(*tensor, values.as_ptr().cast(), 0, std::mem::size_of_val(values.as_slice()));
        }
        if sys::ggml_backend_graph_compute(self.backend, graph.graph) == sys::ggml_status_GGML_STATUS_SUCCESS {
            Ok(())
        } else {
            Err(Error::Ggml("ggml graph compute"))
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

pub(crate) struct Graph {
    pub ctx: *mut sys::ggml_context,
    pub graph: *mut sys::ggml_cgraph,
    allocator: sys::ggml_gallocr_t,
}

impl Graph {
    pub(crate) fn new() -> Result<Self> {
        let ctx = unsafe {
            sys::ggml_init(sys::ggml_init_params {
                mem_size: GRAPH_CONTEXT_BYTES,
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            })
        };
        if ctx.is_null() {
            return Err(Error::Ggml("ggml_init"));
        }
        let graph = unsafe { sys::ggml_new_graph_custom(ctx, GRAPH_NODES, false) };
        if graph.is_null() {
            unsafe { sys::ggml_free(ctx) };
            return Err(Error::Ggml("ggml_new_graph_custom"));
        }
        Ok(Self {
            ctx,
            graph,
            allocator: ptr::null_mut(),
        })
    }

    /// Marks `tensor` as a result to keep and adds everything it needs to the graph.
    pub(crate) unsafe fn output(&mut self, tensor: *mut sys::ggml_tensor) {
        sys::ggml_set_output(tensor);
        sys::ggml_build_forward_expand(self.graph, tensor);
    }

    pub(crate) unsafe fn read(tensor: *mut sys::ggml_tensor) -> Vec<f32> {
        let mut data = vec![0.0f32; sys::ggml_nelements(tensor) as usize];
        sys::ggml_backend_tensor_get(tensor, data.as_mut_ptr().cast(), 0, std::mem::size_of_val(data.as_slice()));
        data
    }
}

impl Drop for Graph {
    fn drop(&mut self) {
        unsafe {
            if !self.allocator.is_null() {
                sys::ggml_gallocr_free(self.allocator);
            }
            sys::ggml_free(self.ctx)
        }
    }
}

/// Loads dynamically-built backends once per process. A no-op on static
/// builds (macOS); on GGML_BACKEND_DL builds (x86 Linux/Windows) this picks
/// the best CPU-variant module for the running machine by cpuid score.
fn load_backends_once() {
    static LOAD: std::sync::Once = std::sync::Once::new();
    LOAD.call_once(|| unsafe { sys::ggml_backend_load_all() });
}

/// Sets the thread count through the backend registry. The direct
/// `ggml_backend_cpu_set_n_threads` symbol does not exist in
/// GGML_BACKEND_DL builds, where the CPU backend is a loadable module.
unsafe fn set_backend_n_threads(backend: sys::ggml_backend_t, n_threads: i32) {
    let dev = sys::ggml_backend_get_device(backend);
    if dev.is_null() {
        return;
    }
    let reg = sys::ggml_backend_dev_backend_reg(dev);
    if reg.is_null() {
        return;
    }
    let addr = sys::ggml_backend_reg_get_proc_address(reg, c"ggml_backend_set_n_threads".as_ptr());
    if !addr.is_null() {
        let set_n_threads: sys::ggml_backend_set_n_threads_t = std::mem::transmute(addr);
        if let Some(set_n_threads) = set_n_threads {
            set_n_threads(backend, n_threads);
        }
    }
}

/// Registry-based CPU backend init (`ggml_backend_cpu_init` does not link
/// against GGML_BACKEND_DL builds).
unsafe fn init_cpu_backend(n_threads: i32) -> sys::ggml_backend_t {
    load_backends_once();
    let backend = sys::ggml_backend_init_by_type(sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_CPU, ptr::null());
    if !backend.is_null() {
        set_backend_n_threads(backend, n_threads);
    }
    backend
}
