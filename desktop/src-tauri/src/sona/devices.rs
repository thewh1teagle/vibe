use super::GpuDevice;
use eyre::{bail, Context, Result};
use std::path::Path;
use std::process::{Command, Stdio};

pub fn list_gpu_devices(binary_path: &Path) -> Result<Vec<GpuDevice>> {
    let mut cmd = Command::new(binary_path);
    cmd.args(["devices"]).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().context("failed to run sona devices")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("sona devices failed: {}", stderr.trim());
    }

    serde_json::from_slice(&output.stdout).context("failed to parse sona devices output")
}
