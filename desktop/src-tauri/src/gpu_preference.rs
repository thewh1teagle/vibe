use eyre::ContextCompat;
use eyre::Result;
use std::env;
use winreg::enums::*;
use winreg::RegKey;

pub fn set_gpu_preference() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let directx = hkcu.open_subkey_with_flags("Software\\Microsoft\\DirectX", KEY_ALL_ACCESS)?;

    // Create the main key for the UserGpuPreferences if it doesn't exist
    let user_gpu_preferences = directx.create_subkey("UserGpuPreferences")?;

    // Get the current executable path
    let program_path = env::current_exe()?;
    let program_path_str = program_path.to_str().context("Failed to convert program path to string")?;

    // Set the GPU preference for the current executable
    // 0 = Auto ; 1 = Power Saving ; 2 = High
    user_gpu_preferences.0.set_value(program_path_str, &"GpuPreference=2;")?;

    log::debug!(
        "GPU preference set for high performance successfully for the current executable ({}).",
        program_path_str
    );
    Ok(())
}
