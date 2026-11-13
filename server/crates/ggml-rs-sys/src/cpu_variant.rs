//! Picks the CPU backend build for this machine.
//!
//! On x86_64 (Linux, Windows and Intel macOS) the native libraries hold the CPU backend three
//! times: built for Haswell (AVX2, FMA, BMI2), for the AVX baseline, and with AVX off (SSE4.2),
//! with every symbol suffixed `_hsw`, `_x64` or `_sse` by `chore build-libs`
//! (`stage-cpu-variant` in libs/libs.chore). ggml's backend registry resolves `ggml_backend_cpu_reg` at link
//! time; this is the definition it finds, and it forwards to the build the CPU can run.
//! Nothing else in ggml or in vibe-server names a CPU backend symbol directly: the rest goes
//! through the registry and `ggml_backend_reg_get_proc_address`.

use crate::ggml_backend_reg_t;

extern "C" {
    fn ggml_backend_cpu_reg_hsw() -> ggml_backend_reg_t;
    fn ggml_backend_cpu_reg_x64() -> ggml_backend_reg_t;
    fn ggml_backend_cpu_reg_sse() -> ggml_backend_reg_t;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Variant {
    Haswell,
    Avx,
    Sse,
}

/// What the CPU reports. The detection macro also checks that the OS saves the AVX register
/// state, which a bare cpuid does not.
#[derive(Debug, Clone, Copy)]
struct Features {
    /// AVX2 with FMA and BMI2: the Haswell build uses all three.
    haswell: bool,
    /// Everything the AVX build was compiled with.
    avx: bool,
}

fn detect() -> Features {
    // GCC and Clang build the AVX backend with F16C too, which Sandy Bridge (AVX, 2011) lacks;
    // MSVC's /arch:AVX does not use it.
    let f16c = cfg!(target_env = "msvc") || is_x86_feature_detected!("f16c");
    Features {
        haswell: is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") && is_x86_feature_detected!("bmi2"),
        avx: is_x86_feature_detected!("avx") && f16c,
    }
}

/// `VIBE_SERVER_CPU_VARIANT` (`avx2`, `baseline` or `sse`) overrides the detection. A machine
/// can advertise instructions it cannot execute: a Hackintosh whose bootloader spoofs CPUID
/// reports AVX2, picks the Haswell build, and dies with SIGILL while loading the model (#1499).
/// Without an override, a CPU with no AVX at all, such as an Atom-class Pentium or Celeron,
/// gets the SSE4.2 build (#1731).
fn pick(requested: Option<&str>, features: Features) -> Variant {
    match requested {
        Some("avx2") | Some("hsw") => return Variant::Haswell,
        Some("baseline") | Some("avx") | Some("x64") => return Variant::Avx,
        Some("sse") | Some("sse42") => return Variant::Sse,
        _ => {}
    }
    if features.haswell {
        Variant::Haswell
    } else if features.avx {
        Variant::Avx
    } else {
        Variant::Sse
    }
}

#[no_mangle]
pub extern "C" fn ggml_backend_cpu_reg() -> ggml_backend_reg_t {
    let requested = std::env::var("VIBE_SERVER_CPU_VARIANT").ok();
    unsafe {
        match pick(requested.as_deref(), detect()) {
            Variant::Haswell => ggml_backend_cpu_reg_hsw(),
            Variant::Avx => ggml_backend_cpu_reg_x64(),
            Variant::Sse => ggml_backend_cpu_reg_sse(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASWELL: Features = Features {
        haswell: true,
        avx: true,
    };
    const SANDY_BRIDGE: Features = Features {
        haswell: false,
        avx: true,
    };
    const ATOM: Features = Features {
        haswell: false,
        avx: false,
    };

    #[test]
    fn detection_picks_the_best_build_the_cpu_can_run() {
        assert_eq!(pick(None, HASWELL), Variant::Haswell);
        assert_eq!(pick(None, SANDY_BRIDGE), Variant::Avx);
        assert_eq!(pick(None, ATOM), Variant::Sse);
    }

    #[test]
    fn an_override_wins_over_what_the_cpu_reports() {
        assert_eq!(pick(Some("baseline"), HASWELL), Variant::Avx);
        assert_eq!(pick(Some("sse"), HASWELL), Variant::Sse);
        assert_eq!(pick(Some("avx2"), ATOM), Variant::Haswell);
        assert_eq!(pick(Some("auto"), ATOM), Variant::Sse);
    }
}
