# Driving the real app (E2E)

A test build of Vibe carries a WebDriver server. A script or an agent can look at the real
windows, click, run JS, take screenshots. Real webview, real CSP, real sidecar. Not the mock.

Use it to check your own change before saying it works.

## Loop

```sh
chore e2e-build            # once, and after Rust or frontend changes (~1 min incremental)
chore e2e-app &            # start it; WebDriver on 127.0.0.1:4445
chore e2e windows          # main, meeting-prompt, dictation-indicator
chore e2e js 'return document.body.innerText.slice(0, 300)'
chore e2e click 'button[aria-label="Settings"]'
chore e2e shot /tmp/x.png  # then Read the image
chore e2e csp              # CSP violations in every window; exit 1 if any
```

Other commands: `use <window>`, `text <css>`, `type <css> <text>`, `wait <css> [seconds]`, `end`.
`uv run e2e/wd.py` with no arguments prints them all.

## Safe by construction

- Own app identifier (`github.com.thewh1teagle.vibe.e2e`): own config, models, cache.
  Never touches the installed app or `chore dev`, and runs beside both.
- Own projects folder inside that profile (`chore e2e-app` sets it). Your `Documents/Vibe` is not touched.
- Global shortcuts (dictation, record) are turned off in the test profile on every start. They are system-wide,
  so the test app would otherwise answer your own dictation key and type the text a second time. To test
  them, turn them on in the test app's settings for that run.
- Own build folder `target/e2e`.
- The driver is behind the cargo feature `e2e`. A normal or release build does not compile it.
- Listens on loopback only.

## Clean install

```sh
# app closed
chore e2e reset            # deletes only the e2e profile
chore e2e-app &            # first launch again: setup page, default model download
```

A different language: `chore e2e-app -AppleLocale he_IL -AppleLanguages '(he-IL)'` (macOS).

## Recipes

All verified on macOS.

Give the app a file (same as dropping it on the window; transcription starts):

```sh
chore e2e js "window.__TAURI__.event.emit('tauri://drag-drop', {paths:['$PWD/server/fixtures/single.wav'], position:{x:300,y:300}}); return 1"
```

Deep link. The OS routes `vibe://` to the installed app, so send the event the app listens to:

```sh
# macOS
chore e2e js "window.__TAURI__.event.emit('deep-link://new-url', ['vibe://download/?url=https://…']); return 1"
# Windows / Linux
chore e2e js "window.__TAURI__.event.emit('single-instance', ['vibe', 'vibe://download/?url=https://…']); return 1"
```

Native dialogs (`ask`, `confirm`, save panels) are not in the webview. On macOS read and click them
with System Events (the terminal needs Accessibility permission):

```sh
PID=$(pgrep -f 'target/e2e/debug/vibe$')
osascript -e "tell application \"System Events\" to tell (first process whose unix id is $PID) to get {value of every static text, name of every button} of sheet 1 of window 1"
osascript -e "tell application \"System Events\" to tell (first process whose unix id is $PID) to click button \"Yes\" of sheet 1 of window 1"
```

Exports without a save panel: turn on auto-export in the test profile, then transcribe.

```sh
# in <profile>/app_config.json (the app reloads it on change)
"transcription.autoExport": {"enabled": true, "formats": ["pdf","docx"], "destination": "folder", "folder": "<profile>/exports", "replace": true}
```

Call a Rust command directly:

```sh
chore e2e js "return window.__TAURI__.core.invoke('get_models_folder')"
```

Wait inside one call: `return new Promise(r => setTimeout(() => r(document.body.innerText), 2000))`.

Tauri locks `__TAURI_INTERNALS__`, so IPC cannot be stubbed from JS. Do not try; use the real flow.

Profile folder on macOS: `~/Library/Application Support/github.com.thewh1teagle.vibe.e2e`.

## Rules

- Prefer checks that return data (`js`, `text`, `csp`) over screenshots; use `shot` to see layout.
- Never point tests at the real profile. If you need existing data, copy it into the e2e profile.
- A check worth keeping for every release goes into the smoke suite (not written yet); the rest
  stays ad hoc.
- Windows and Linux: same build flags work there; set `TAURI_WEBDRIVER_PORT=4445` when starting
  the app. Not exercised in CI yet.
