//! Picks the CPU backend build for this machine.
//!
//! On x86_64 the native libraries hold the CPU backend twice, built for Haswell (AVX2,
//! FMA, BMI2) and for the AVX baseline, with every symbol suffixed `_hsw` or `_x64` by
//! `chore build-libs`. ggml's backend registry resolves `ggml_backend_cpu_reg` at link
//! time; this is the definition it finds, and it forwards to the build the CPU can run.
//! Nothing else in ggml or in Sona names a CPU backend symbol directly: the rest goes
//! through the registry and `ggml_backend_reg_get_proc_address`.

use crate::ggml_backend_reg_t;

extern "C" {
    fn ggml_backend_cpu_reg_hsw() -> ggml_backend_reg_t;
    fn ggml_backend_cpu_reg_x64() -> ggml_backend_reg_t;
}

/// The macro also checks that the OS saves the AVX register state, which a bare cpuid does not.
fn haswell() -> bool {
    is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") && is_x86_feature_detected!("bmi2")
}

#[no_mangle]
pub extern "C" fn ggml_backend_cpu_reg() -> ggml_backend_reg_t {
    unsafe {
        if haswell() {
            ggml_backend_cpu_reg_hsw()
        } else {
            ggml_backend_cpu_reg_x64()
        }
    }
}
