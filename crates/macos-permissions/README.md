# macos-permissions

Check and request macOS system audio recording permission ("System Audio Recording Only" in Privacy & Security).

## Usage

```rust
use macos_permissions::{check_system_audio_permission, request_system_audio_permission, open_system_audio_settings};

if !check_system_audio_permission() {
    let granted = request_system_audio_permission();
    if !granted {
        open_system_audio_settings();
    }
}
```

## Behavior

| # | Situation | Result |
|---|---|---|
| 1 | First time | `request` shows system prompt, blocks until user responds |
| 2 | Already granted | `check` returns `true`, done |
| 3 | Previously denied | `request` returns `false` immediately, call `open_system_audio_settings` |

## Notes

- macOS only. All functions are no-ops / return `true` on other platforms.
- Uses private `TCC.framework` (`kTCCServiceAudioCapture`) — safe for non-App-Store apps.
- No subprocess for permission check. `open_system_audio_settings` uses `open` CLI.
