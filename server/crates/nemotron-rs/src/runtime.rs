use std::ptr;

use crate::{sys, Error, Result};

pub(crate) struct CpuRuntime {
    backend: sys::ggml_backend_t,
    owned: bool,
    scheduler: sys::ggml_backend_sched_t,
    scheduler_cpu: sys::ggml_backend_t,
}

impl CpuRuntime {
    pub fn new() -> Result<Self> {
        Self::with_threads(4)
    }

    fn with_threads(threads: usize) -> Result<Self> {
        let backend = unsafe { init_cpu_backend(threads.min(i32::MAX as usize) as i32) };
        if backend.is_null() {
            Err(Error::Ggml("cpu backend init"))
        } else {
            Ok(Self {
                backend,
                owned: true,
                scheduler: ptr::null_mut(),
                scheduler_cpu: ptr::null_mut(),
            })
        }
    }

    pub unsafe fn execute(&self, graph: &mut Graph, inputs: &[(*mut sys::ggml_tensor, &[f32])]) -> Result<()> {
        for &(tensor, _) in inputs {
            sys::ggml_set_input(tensor);
        }
        if self.scheduler.is_null() {
            if graph.allocator.is_null() {
                graph.allocator = sys::ggml_gallocr_new(sys::ggml_backend_get_default_buffer_type(self.backend));
                if graph.allocator.is_null() || !sys::ggml_gallocr_alloc_graph(graph.allocator, graph.graph) {
                    return Err(Error::Ggml("ggml_gallocr_alloc_graph"));
                }
            }
        } else if !graph.scheduled {
            // All encoder ops are GPU-compatible. Pinning nodes also gives
            // the scheduler a concrete buffer id before its allocation pass.
            sys::ggml_backend_sched_reset(self.scheduler);
            for index in 0..sys::ggml_graph_n_nodes(graph.graph) {
                sys::ggml_backend_sched_set_tensor_backend(
                    self.scheduler,
                    sys::ggml_graph_node(graph.graph, index),
                    self.backend,
                );
            }
            if !sys::ggml_backend_sched_alloc_graph(self.scheduler, graph.graph) {
                return Err(Error::Ggml("ggml_backend_sched_alloc_graph"));
            }
            graph.scheduled = true;
        }
        for &(tensor, values) in inputs {
            sys::ggml_backend_tensor_set(tensor, values.as_ptr().cast(), 0, std::mem::size_of_val(values));
        }
        let status = if self.scheduler.is_null() {
            sys::ggml_backend_graph_compute(self.backend, graph.graph)
        } else {
            sys::ggml_backend_sched_graph_compute(self.scheduler, graph.graph)
        };
        if status == sys::ggml_status_GGML_STATUS_SUCCESS {
            Ok(())
        } else {
            Err(Error::Ggml("ggml graph compute"))
        }
    }
}

pub(crate) fn accelerated_runtime(backend: Option<sys::ggml_backend_t>) -> Result<CpuRuntime> {
    match backend {
        Some(backend) => Ok(CpuRuntime {
            backend,
            owned: false,
            scheduler: ptr::null_mut(),
            scheduler_cpu: ptr::null_mut(),
        }),
        None => CpuRuntime::with_threads(
            std::env::var("NEMOTRON_THREADS")
                .ok()
                .and_then(|value| value.parse().ok())
                .filter(|threads| *threads > 0)
                .unwrap_or_else(|| {
                    std::thread::available_parallelism()
                        .map(|count| count.get())
                        .map(|threads| (threads * 4 / 5).max(1))
                        .unwrap_or(4)
                }),
        ),
    }
}

impl Drop for CpuRuntime {
    fn drop(&mut self) {
        unsafe {
            if !self.scheduler.is_null() {
                sys::ggml_backend_sched_free(self.scheduler);
            }
            if !self.scheduler_cpu.is_null() {
                sys::ggml_backend_free(self.scheduler_cpu);
            }
            if self.owned {
                sys::ggml_backend_free(self.backend);
            }
        }
    }
}

pub(crate) struct Graph {
    pub ctx: *mut sys::ggml_context,
    pub graph: *mut sys::ggml_cgraph,
    allocator: sys::ggml_gallocr_t,
    scheduled: bool,
}

impl Graph {
    pub fn new() -> Result<Self> {
        let ctx = unsafe {
            sys::ggml_init(sys::ggml_init_params {
                mem_size: 64 * 1024 * 1024,
                mem_buffer: ptr::null_mut(),
                no_alloc: true,
            })
        };
        if ctx.is_null() {
            return Err(Error::Ggml("ggml_init"));
        }
        let graph = unsafe { sys::ggml_new_graph_custom(ctx, 8192, false) };
        if graph.is_null() {
            unsafe { sys::ggml_free(ctx) };
            return Err(Error::Ggml("ggml_new_graph_custom"));
        }
        Ok(Self {
            ctx,
            graph,
            allocator: ptr::null_mut(),
            scheduled: false,
        })
    }
    pub unsafe fn output(&mut self, tensor: *mut sys::ggml_tensor) {
        sys::ggml_set_output(tensor);
        sys::ggml_build_forward_expand(self.graph, tensor);
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
    let backend = sys::ggml_backend_init_by_type(
        sys::ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_CPU,
        std::ptr::null(),
    );
    if !backend.is_null() {
        set_backend_n_threads(backend, n_threads);
    }
    backend
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn executes_direct_ggml_graph() {
        unsafe {
            let runtime = CpuRuntime::new().unwrap();
            let mut graph = Graph::new().unwrap();
            let a = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, 4);
            let b = sys::ggml_new_tensor_1d(graph.ctx, sys::ggml_type_GGML_TYPE_F32, 4);
            let out = sys::ggml_add(graph.ctx, a, b);
            graph.output(out);
            runtime
                .execute(&mut graph, &[(a, &[1., 2., 3., 4.]), (b, &[4., 3., 2., 1.])])
                .unwrap();
            let mut values = [0.0f32; 4];
            sys::ggml_backend_tensor_get(out, values.as_mut_ptr().cast(), 0, 16);
            assert_eq!(values, [5.0f32; 4]);
        }
    }
}
