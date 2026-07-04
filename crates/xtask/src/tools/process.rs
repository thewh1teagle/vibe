use std::process::Command;

use anyhow::Result;

pub fn run(command: &mut Command) -> Result<()> {
    println!("$ {}", display(command));
    let status = command.status()?;
    anyhow::ensure!(status.success(), "command failed: {}", display(command));
    Ok(())
}

fn display(command: &Command) -> String {
    let mut parts = Vec::new();
    parts.push(command.get_program().to_string_lossy().into_owned());
    parts.extend(
        command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned()),
    );
    parts.join(" ")
}
