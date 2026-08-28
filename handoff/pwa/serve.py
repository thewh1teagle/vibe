#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Serve the *built* Vibe Phone PWA (`handoff/pwa/dist/`) over HTTP.

For development use Vite instead: `pnpm -C handoff/pwa dev` (port 8088). This script is
for checking a production build without a bundler in the loop:

    pnpm -C handoff/pwa build && uv run handoff/pwa/serve.py     # http://localhost:8088

With --tunnel it also runs `cloudflared` against the same port, so a real phone can
load the PWA over HTTPS -- the microphone needs a secure origin. `chore phone-tunnel`
builds and then calls this.

Sets the MIME types browsers require for `.wasm` and `.webmanifest`, disables
caching (so a rebuilt wasm is always picked up) and sends permissive CORS plus
the cross-origin isolation headers that SharedArrayBuffer-using wasm may need.
"""

from __future__ import annotations

import argparse
import atexit
import functools
import http.server
import shutil
import socket
import socketserver
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dist"

EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **EXTRA_TYPES,
    }

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802 - stdlib naming
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:
        print(f"  {self.address_string()} {fmt % args}")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def start_tunnel(port: int) -> subprocess.Popen:
    """Run cloudflared against the local server and leave it printing to this terminal.

    Its output is inherited rather than captured so the https://…trycloudflare.com URL
    appears as soon as cloudflared has it; the tunnel dies with this process.
    """
    if not shutil.which("cloudflared"):
        raise SystemExit("cloudflared is not on PATH — brew install cloudflared")

    print("Opening a tunnel — copy the https:// URL cloudflared prints below.")
    proc = subprocess.Popen(["cloudflared", "tunnel", "--url", f"http://localhost:{port}"])

    def stop() -> None:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    atexit.register(stop)
    return proc


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8088)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument(
        "--tunnel",
        action="store_true",
        help="also run `cloudflared` against this port and print its https:// URL",
    )
    args = ap.parse_args()

    if not ROOT.is_dir():
        raise SystemExit(f"{ROOT} does not exist — run `pnpm -C handoff/pwa build` first.")

    handler = functools.partial(Handler, directory=str(ROOT))
    with Server((args.host, args.port), handler) as httpd:
        print(f"Serving {ROOT} on:")
        print(f"  http://localhost:{args.port}")
        print(f"  http://{lan_ip()}:{args.port}   (phones: needs HTTPS for the microphone)")
        if args.tunnel:
            start_tunnel(args.port)
        print("Ctrl-C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
