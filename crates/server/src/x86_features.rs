use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct X86feature {
    pub enabled: bool,
    pub support: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct X86features {
    pub avx: X86feature,
    pub avx2: X86feature,
    pub fma: X86feature,
    pub f16c: X86feature,
}

impl X86features {
    pub fn new() -> Self {
        // features enabled by default
        // Disabled only if WHISPER_NO_{flag} was set during compile
        Self {
            avx: X86feature {
                #[allow(clippy::comparison_to_empty)]
                enabled: env!("WHISPER_NO_AVX") != "ON",
                support: is_x86_feature_detected!("avx"),
            },
            avx2: X86feature {
                #[allow(clippy::comparison_to_empty)]
                enabled: env!("WHISPER_NO_AVX2") != "ON",
                support: is_x86_feature_detected!("avx2"),
            },
            fma: X86feature {
                #[allow(clippy::comparison_to_empty)]
                enabled: env!("WHISPER_NO_FMA") != "ON",
                support: is_x86_feature_detected!("fma"),
            },
            f16c: X86feature {
                #[allow(clippy::comparison_to_empty)]
                enabled: env!("WHISPER_NO_F16C") != "ON",
                support: is_x86_feature_detected!("f16c"),
            },
        }
    }
}
