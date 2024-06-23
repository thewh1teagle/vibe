use eyre::ContextCompat;
use eyre::Result;
use winreg::enums::*;
use winreg::RegKey;

pub fn register() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu.open_subkey_with_flags("Software\\Classes", KEY_ALL_ACCESS)?;

    // Create the main key for the protocol handler
    let app_class = classes.create_subkey("vibe")?;
    app_class.0.set_value("URL Protocol", &"")?;

    // Create the necessary subkeys: shell, open, command
    let shell = app_class.0.create_subkey("shell")?;
    let open = shell.0.create_subkey("open")?;
    let command = open.0.create_subkey("command")?;

    // Set the default value for the command key
    let program_path = std::env::current_exe()?;
    let command_value = format!("\"{}\" \"%1\"", program_path.to_str().context("tostr")?);
    command.0.set_value("", &command_value)?;

    log::debug!("Protocol handler registered successfully.");
    Ok(())
}
