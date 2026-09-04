# Python Distribution — `pip install sona`

Follow-up to `managed-service_002.md`. Details on how to distribute Sona as a Python package so the user experience is:

```bash
pip install sona
```
```python
import sona
process = sona.serve()  # spawns binary, waits for ready
# use OpenAI client normally
process.stop()
```

No compilation, no manual binary download, no PATH management.

## How it works

### Platform wheels with embedded binary

Go cross-compiles to a single static binary per platform. Ship each binary inside a platform-specific Python wheel:

```
sona-0.1.0-py3-none-macosx_11_0_arm64.whl    → contains sona (macOS Apple Silicon)
sona-0.1.0-py3-none-macosx_11_0_x86_64.whl   → contains sona (macOS Intel)
sona-0.1.0-py3-none-manylinux_2_17_x86_64.whl → contains sona (Linux x86_64)
sona-0.1.0-py3-none-manylinux_2_17_aarch64.whl → contains sona (Linux arm64)
sona-0.1.0-py3-none-win_amd64.whl            → contains sona.exe (Windows x86_64)
```

pip automatically selects the right wheel for the user's platform. This is the same pattern used by:
- **ruff** — Rust linter, ships binary via pip
- **oxlint** — Rust linter, ships binary via pip
- **turbo** — Go build tool, ships binary via pip

### Python package structure

```
sona/
├── __init__.py        # exports serve(), find_binary(), version
├── _binary/
│   └── sona           # the prebuilt Go binary (platform-specific)
├── server.py          # process lifecycle: spawn, wait for ready, stop
└── py.typed           # PEP 561 marker
```

### The Python wrapper (~100 lines total)

```python
# sona/server.py
import subprocess, json, sys, signal, atexit
from pathlib import Path

class SonaProcess:
    def __init__(self, port: int, process: subprocess.Popen):
        self.port = port
        self.process = process
        self.base_url = f"http://localhost:{port}/v1"

    def stop(self):
        self.process.send_signal(signal.SIGTERM)
        self.process.wait(timeout=30)

def serve(port: int = 0) -> SonaProcess:
    binary = Path(__file__).parent / "_binary" / "sona"
    proc = subprocess.Popen(
        [str(binary), "serve", "--port", str(port)],
        stdout=subprocess.PIPE,
    )
    # read stdout until ready signal
    line = proc.stdout.readline()
    info = json.loads(line)
    assert info["status"] == "ready"
    actual_port = info["port"]

    # cleanup on interpreter exit
    atexit.register(lambda: proc.terminate())

    return SonaProcess(port=actual_port, process=proc)
```

### End-to-end usage

```python
import sona
from openai import OpenAI

# start sona
process = sona.serve()

# standard OpenAI client — no custom SDK
client = OpenAI(base_url=process.base_url, api_key="local")

# load a model
import httpx
httpx.post(f"{process.base_url}/models/load", json={"path": "/models/ggml-large-v3.bin"})

# transcribe
with open("interview.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="ggml-large-v3.bin",
        file=f,
        response_format="verbose_json"
    )

print(result.segments)  # timed segments with start/end

# cleanup
process.stop()
```

## Build & release pipeline

CI already builds Sona for 6 platform targets. Adding wheel packaging:

1. **After Go cross-compilation** — each platform binary exists as an artifact
2. **Run wheel builder** — for each platform, create a wheel containing:
   - The Python wrapper code (identical across platforms)
   - The platform-specific binary in `sona/_binary/`
3. **Upload to PyPI** — `twine upload dist/*.whl`

Tools for this:
- **`wheel`** package — manual wheel construction (set platform tags explicitly)
- Or **`cibuildwheel`** — but overkill since there's no native Python extension to compile, just a binary to embed
- Simplest: a Python script in `scripts/` that assembles wheels from the Go build artifacts, setting the correct platform tags in the wheel filename

### Wheel construction script (sketch)

```python
# scripts/build-wheels.py
import zipfile, hashlib, base64
from pathlib import Path

PLATFORMS = {
    "darwin-arm64": "macosx_11_0_arm64",
    "darwin-amd64": "macosx_11_0_x86_64",
    "linux-amd64": "manylinux_2_17_x86_64.manylinux2014_x86_64",
    "linux-arm64": "manylinux_2_17_aarch64.manylinux2014_aarch64",
    "windows-amd64": "win_amd64",
}

for go_platform, wheel_platform in PLATFORMS.items():
    binary_name = "sona.exe" if "windows" in go_platform else "sona"
    binary_path = Path(f"dist/{go_platform}/{binary_name}")

    wheel_name = f"sona-{VERSION}-py3-none-{wheel_platform}.whl"

    with zipfile.ZipFile(f"dist/{wheel_name}", "w") as whl:
        # add python source
        for py_file in Path("python/sona").glob("**/*.py"):
            whl.write(py_file, f"sona/{py_file.relative_to('python/sona')}")
        # add binary
        whl.write(binary_path, f"sona/_binary/{binary_name}")
        # add METADATA, RECORD, WHEEL files...
```

## What this depends on from 001/002

- **Port 0 support + stdout ready signal** — the Python wrapper reads stdout to discover the port
- **Model load/unload API** — so the wrapper doesn't need model path at spawn time
- **Graceful SIGTERM handling** — so `process.stop()` is clean

Without these three, the Python package can't provide a good `serve()` / `stop()` experience.

## Versioning

The Python package version should track the Sona binary version. When Sona tags `v0.2.0`, the Python wheels are built from that tag and published as `sona==0.2.0` on PyPI.
