//! Self/cross-attention KV cache, ported from whisper.cpp's
//! `whisper_kv_cache` and its cell bookkeeping. Sequences (decoders) share
//! physical cells through per-cell `seq_id` sets — `seq_cp` copies metadata
//! only, never tensor data.

use std::collections::BTreeSet;

use ggml_rs_sys as sys;

use crate::model::Tensor;
use crate::Error;

#[derive(Clone, Default)]
pub(crate) struct Cell {
    pub pos: i32,
    pub seq_id: BTreeSet<i32>,
}

pub(crate) struct KvCache {
    pub head: u32,
    pub size: u32,
    /// Computed before each graph build.
    pub n: u32,
    pub cells: Vec<Cell>,
    pub k: Tensor,
    pub v: Tensor,
    ctx: *mut sys::ggml_context,
    buffer: sys::ggml_backend_buffer_t,
}

unsafe impl Send for KvCache {}

impl Drop for KvCache {
    fn drop(&mut self) {
        unsafe {
            if !self.buffer.is_null() {
                sys::ggml_backend_buffer_free(self.buffer);
            }
            if !self.ctx.is_null() {
                sys::ggml_free(self.ctx);
            }
        }
    }
}

impl KvCache {
    pub fn new(
        backend: sys::ggml_backend_t,
        wtype: sys::ggml_type,
        n_text_state: i64,
        n_text_layer: i64,
        n_ctx: i64,
    ) -> Result<Self, Error> {
        let n_elements = n_text_state * n_text_layer * n_ctx;
        unsafe {
            let ctx = sys::ggml_init(sys::ggml_init_params {
                mem_size: 2 * sys::ggml_tensor_overhead(),
                mem_buffer: std::ptr::null_mut(),
                no_alloc: true,
            });
            if ctx.is_null() {
                return Err(Error::Ggml("kv cache context"));
            }
            let k = sys::ggml_new_tensor_1d(ctx, wtype, n_elements);
            let v = sys::ggml_new_tensor_1d(ctx, wtype, n_elements);
            let buffer = sys::ggml_backend_alloc_ctx_tensors(ctx, backend);
            if buffer.is_null() {
                sys::ggml_free(ctx);
                return Err(Error::OutOfMemory {
                    what: "kv cache",
                    gpu: crate::state::backend_is_gpu(backend),
                });
            }
            sys::ggml_backend_buffer_clear(buffer, 0);
            Ok(Self {
                head: 0,
                size: n_ctx as u32,
                n: 0,
                cells: vec![
                    Cell {
                        pos: -1,
                        seq_id: BTreeSet::new()
                    };
                    n_ctx as usize
                ],
                k,
                v,
                ctx,
                buffer,
            })
        }
    }

    /// `whisper_kv_cache_find_slot`.
    pub fn find_slot(&mut self, pos: &[i32], seq: &[i32]) -> bool {
        let n_ctx = self.size;
        let n_tokens = pos.len() as u32;
        if n_tokens > n_ctx {
            tracing::error!(n_tokens, n_ctx, "batch does not fit in kv cache");
            return false;
        }

        let mut n_tested = 0u32;
        loop {
            if self.head + n_tokens > n_ctx {
                n_tested += n_ctx - self.head;
                self.head = 0;
                continue;
            }
            let mut found = true;
            for i in 0..n_tokens {
                if self.cells[(self.head + i) as usize].pos >= 0 {
                    found = false;
                    self.head += i + 1;
                    n_tested += i + 1;
                    break;
                }
            }
            if found {
                break;
            }
            if n_tested >= n_ctx {
                return false;
            }
        }

        for i in 0..n_tokens as usize {
            let cell = &mut self.cells[self.head as usize + i];
            cell.pos = pos[i];
            cell.seq_id.insert(seq[i]);
        }
        true
    }

    /// `whisper_kv_cache_cell_max`.
    pub fn cell_max(&self) -> u32 {
        for i in (1..self.size as usize).rev() {
            if self.cells[i].pos >= 0 && !self.cells[i].seq_id.is_empty() {
                return i as u32 + 1;
            }
        }
        1
    }

    pub fn clear(&mut self) {
        for cell in &mut self.cells {
            cell.pos = -1;
            cell.seq_id.clear();
        }
        self.head = 0;
        unsafe { sys::ggml_backend_buffer_clear(self.buffer, 0) };
    }

    /// `whisper_kv_cache_seq_rm` — p0/p1 < 0 mean unbounded.
    pub fn seq_rm(&mut self, seq_id: i32, p0: i32, p1: i32) {
        let p0 = if p0 < 0 { 0 } else { p0 };
        let p1 = if p1 < 0 { i32::MAX } else { p1 };
        let mut new_head = self.size;

        for i in 0..self.size as usize {
            let cell = &mut self.cells[i];
            if cell.pos >= p0 && cell.pos < p1 {
                if seq_id < 0 {
                    cell.seq_id.clear();
                } else if cell.seq_id.contains(&seq_id) {
                    cell.seq_id.remove(&seq_id);
                } else {
                    continue;
                }
                if cell.seq_id.is_empty() {
                    cell.pos = -1;
                    if new_head == self.size {
                        new_head = i as u32;
                    }
                }
            }
        }
        if new_head != self.size {
            self.head = new_head;
        }
    }

    /// `whisper_kv_cache_seq_cp` — metadata only.
    pub fn seq_cp(&mut self, seq_id_src: i32, seq_id_dst: i32, p0: i32, p1: i32) {
        let p0 = if p0 < 0 { 0 } else { p0 };
        let p1 = if p1 < 0 { i32::MAX } else { p1 };
        self.head = 0;
        for cell in &mut self.cells {
            if cell.seq_id.contains(&seq_id_src) && cell.pos >= p0 && cell.pos < p1 {
                cell.seq_id.insert(seq_id_dst);
            }
        }
    }
}
