# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Drive a running e2e build of Vibe over its embedded WebDriver server.

The e2e build (`chore e2e-build`) serves W3C WebDriver on 127.0.0.1:$TAURI_WEBDRIVER_PORT
(4445 by default). This is the thin client agents and scripts use to look at and poke the
real app: no test runner, one command per action, JSON on stdout.

    uv run e2e/wd.py status
    uv run e2e/wd.py windows                     # handles, with title and url of each
    uv run e2e/wd.py use <handle>                # switch window
    uv run e2e/wd.py js 'return document.title'  # run script in the current window
    uv run e2e/wd.py click 'button[aria-label="Settings"]'
    uv run e2e/wd.py text 'h1'
    uv run e2e/wd.py type 'input[name=q]' 'hello'
    uv run e2e/wd.py wait 'css selector' [seconds]
    uv run e2e/wd.py shot out.png
    uv run e2e/wd.py csp                         # CSP violations recorded in every window; exit 1 if any
    uv run e2e/wd.py reset                       # delete the test profile (app must be closed)
    uv run e2e/wd.py seed                        # keep projects inside the test profile (`chore e2e-app` runs it)
    uv run e2e/wd.py end
"""

import base64
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PORT = int(os.environ.get("TAURI_WEBDRIVER_PORT", "4445"))
BASE = f"http://127.0.0.1:{PORT}"
SESSION_FILE = Path(os.environ.get("TMPDIR", "/tmp")) / f"vibe-e2e-session-{PORT}"
ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"
APP_ID = "github.com.thewh1teagle.vibe.e2e"  # tauri.e2e.conf.json; never the real app's folders


def profile_dirs() -> list[Path]:
    home = Path.home()
    if sys.platform == "darwin":
        roots = [home / "Library/Application Support", home / "Library/Caches", home / "Library/WebKit"]
    elif sys.platform == "win32":
        roots = [Path(os.environ["APPDATA"]), Path(os.environ["LOCALAPPDATA"])]
    else:
        roots = [
            Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")),
            Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")),
            Path(os.environ.get("XDG_CACHE_HOME", home / ".cache")),
        ]
    return [root / APP_ID for root in roots]


def call(method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read() or b"{}").get("value")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        sys.exit(f"webdriver {method} {path} -> {error.code}: {detail}")
    except urllib.error.URLError as error:
        sys.exit(f"no e2e app on {BASE} ({error.reason}); start it with `chore e2e-app`")


def session() -> str:
    if SESSION_FILE.exists():
        sid = SESSION_FILE.read_text().strip()
        try:
            with urllib.request.urlopen(f"{BASE}/session/{sid}/window/handles", timeout=5):
                return sid
        except (urllib.error.URLError, OSError):
            pass
    value = call("POST", "/session", {"capabilities": {"alwaysMatch": {}}})
    sid = value["sessionId"]
    SESSION_FILE.write_text(sid)
    return sid


def s(path: str) -> str:
    return f"/session/{session()}{path}"


def find(selector: str) -> str:
    element = call("POST", s("/element"), {"using": "css selector", "value": selector})
    return element[ELEMENT_KEY]


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command, args = sys.argv[1], sys.argv[2:]
    out = None
    if command == "status":
        out = call("GET", "/status")
    elif command == "windows":
        current = call("GET", s("/window"))
        out = []
        for handle in call("GET", s("/window/handles")):
            call("POST", s("/window"), {"handle": handle})
            out.append({"handle": handle, "title": call("GET", s("/title")), "url": call("GET", s("/url"))})
        call("POST", s("/window"), {"handle": current})
    elif command == "use":
        call("POST", s("/window"), {"handle": args[0]})
        out = {"window": args[0]}
    elif command == "js":
        out = call("POST", s("/execute/sync"), {"script": args[0], "args": args[1:]})
    elif command == "click":
        call("POST", s(f"/element/{find(args[0])}/click"), {})
        out = {"clicked": args[0]}
    elif command == "text":
        out = call("GET", s(f"/element/{find(args[0])}/text"))
    elif command == "type":
        call("POST", s(f"/element/{find(args[0])}/value"), {"text": args[1]})
        out = {"typed": args[0]}
    elif command == "wait":
        deadline = time.time() + float(args[1] if len(args) > 1 else 15)
        script = "return !!document.querySelector(arguments[0])"
        while not call("POST", s("/execute/sync"), {"script": script, "args": [args[0]]}):
            if time.time() > deadline:
                sys.exit(f"timed out waiting for {args[0]}")
            time.sleep(0.25)
        out = {"found": args[0]}
    elif command == "shot":
        Path(args[0]).write_bytes(base64.b64decode(call("GET", s("/screenshot"))))
        out = {"saved": args[0]}
    elif command == "csp":
        current = call("GET", s("/window"))
        out = {}
        for handle in call("GET", s("/window/handles")):
            call("POST", s("/window"), {"handle": handle})
            out[handle] = call("POST", s("/execute/sync"), {"script": "return window.__cspViolations ?? null", "args": []})
        call("POST", s("/window"), {"handle": current})
        print(json.dumps(out, ensure_ascii=False, indent=1))
        sys.exit(1 if any(out.values()) else 0)
    elif command == "reset":
        try:
            urllib.request.urlopen(f"{BASE}/status", timeout=2)
            sys.exit("the e2e app is running; close it before resetting its profile")
        except (urllib.error.URLError, OSError):
            pass
        out = {"removed": []}
        for folder in profile_dirs():
            if folder.exists():
                shutil.rmtree(folder)
                out["removed"].append(str(folder))
        SESSION_FILE.unlink(missing_ok=True)
    elif command == "seed":
        # Projects default to the user's real Documents/Vibe, which is not scoped by app identifier.
        # Point the test profile at its own folder before the app starts, so tests never write there.
        config_dir = profile_dirs()[0]
        config_path = config_dir / "app_config.json"
        config = json.loads(config_path.read_text()) if config_path.exists() else {}
        projects = config_dir / "projects"
        if config.get("transcription.projectsPath") != str(projects):
            projects.mkdir(parents=True, exist_ok=True)
            config["transcription.projectsPath"] = str(projects)
            config_path.write_text(json.dumps(config, indent=2))
        out = {"projects": str(projects)}
    elif command == "end":
        call("DELETE", f"/session/{session()}")
        SESSION_FILE.unlink(missing_ok=True)
        out = {"ended": True}
    else:
        sys.exit(__doc__)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
