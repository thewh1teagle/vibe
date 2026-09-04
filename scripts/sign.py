# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
#     "flask==3.1.2",
#     "python-dotenv==1.2.1",
# ]
# ///
"""
Windows code signing over a YubiKey, in two halves of one script.

  uv run --env-file .env.local scripts/sign.py serve
      On the machine with the YubiKey: a small HTTP server that runs jsign on
      every uploaded file, reachable through a Cloudflare tunnel.
      Needs jsign and cloudflared on PATH, and TUNNEL_URL, CF_TUNNEL_TOKEN,
      PIV_PIN in the environment (TUNNEL_SECRET too, or one is generated).

  uv run scripts/sign.py sign <file>
      In the release job, as Tauri's Windows signCommand: uploads the file to
      the server and writes the signed bytes back in place. A dry run unless
      SIGN_ENABLED=true; then SIGN_TUNNEL_URL and SIGN_TUNNEL_SECRET are needed.

Verify a signature:
  & "${env:ProgramFiles(x86)}\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe" verify /pa /v <file>
"""

import argparse
import fnmatch
import os
import sys

# Only these get signed by the client. Everything else is skipped, which keeps
# the YubiKey's touch count and the tunnel's traffic down.
# TODO: restore the whitelist once the patterns are final.
# SIGN_PATTERNS = ["vibe.exe", "vibe*setup*.exe", "vibe-server*.exe"]
SIGN_PATTERNS = ["*"]


# --- sign: the client ---------------------------------------------------------


def upload_for_signing(path: str) -> None:
    import httpx

    url = os.environ["SIGN_TUNNEL_URL"].rstrip("/")
    secret = os.environ["SIGN_TUNNEL_SECRET"]

    with open(path, "rb") as f:
        resp = httpx.post(
            f"{url}/sign",
            files={"file": (os.path.basename(path), f)},
            headers={"X-Tunnel-Secret": secret},
            timeout=120,
        )

    if resp.status_code != 200:
        print(f"[sign] ERROR: server returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    with open(path, "wb") as f:
        f.write(resp.content)


def cmd_sign(args: argparse.Namespace) -> None:
    path = args.file
    basename = os.path.basename(path)

    if not any(fnmatch.fnmatch(basename.lower(), p) for p in SIGN_PATTERNS):
        print(f"[sign] SKIP: {basename}")
        return

    if os.environ.get("SIGN_ENABLED", "").lower() != "true":
        print(f"[sign] DRY RUN: {basename} (set SIGN_ENABLED=true to sign)")
        return

    missing = [v for v in ("SIGN_TUNNEL_URL", "SIGN_TUNNEL_SECRET") if not os.environ.get(v)]
    if missing:
        print(f"[sign] ERROR: missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print(f"[sign] SIGNING: {basename}")
    upload_for_signing(path)
    print(f"[sign] OK: {basename}")


# --- serve: the YubiKey side --------------------------------------------------

REQUIRED_TOOLS = ["jsign", "cloudflared"]
REQUIRED_ENV = ["TUNNEL_URL", "CF_TUNNEL_TOKEN", "PIV_PIN"]


def cmd_serve(args: argparse.Namespace) -> None:
    import logging
    import secrets
    import shutil
    import subprocess
    import tempfile
    import threading
    from pathlib import Path

    from dotenv import load_dotenv
    from flask import Flask, jsonify, request, send_file

    load_dotenv()
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    missing_tools = [t for t in REQUIRED_TOOLS if not shutil.which(t)]
    if missing_tools:
        print(f"Missing tools: {', '.join(missing_tools)}")
        print("Install them and make sure they're on PATH.")
        sys.exit(1)
    missing_env = [v for v in REQUIRED_ENV if not os.environ.get(v)]
    if missing_env:
        print(f"Missing env vars: {', '.join(missing_env)}")
        print("Add them to .env (or pass --env-file) or export them.")
        sys.exit(1)

    secret = os.environ.get("TUNNEL_SECRET") or secrets.token_urlsafe(32)
    tunnel_url = os.environ["TUNNEL_URL"]
    cf_token = os.environ["CF_TUNNEL_TOKEN"]
    piv_pin = os.environ["PIV_PIN"]

    app = Flask(__name__)

    @app.route("/")
    def index():
        print(f"[INFO] health check from {request.remote_addr}")
        return jsonify({"status": "ok"})

    @app.route("/sign", methods=["POST"])
    def sign():
        if request.headers.get("X-Tunnel-Secret") != secret:
            print(f"[DENIED] unauthorized request from {request.remote_addr}")
            return jsonify({"error": "unauthorized"}), 401

        file = request.files.get("file")
        if not file or not file.filename:
            print(f"[ERROR] no file in request from {request.remote_addr}")
            return jsonify({"error": "no file provided"}), 400

        print(f"[SIGN] {file.filename} ({request.content_length} bytes) from {request.remote_addr}")

        with tempfile.TemporaryDirectory() as tmp:
            filepath = Path(tmp) / file.filename
            file.save(filepath)

            result = subprocess.run(
                [
                    "jsign",
                    "--storetype", "YUBIKEY",
                    "--storepass", piv_pin,
                    "--alias", "X.509 Certificate for Digital Signature",
                    "--tsaurl", "http://timestamp.digicert.com",
                    str(filepath),
                ],
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                print(f"[FAIL] jsign failed: {result.stderr.strip()}")
                return jsonify({"error": "signing failed", "stderr": result.stderr, "stdout": result.stdout}), 500

            print(f"[OK] signed {file.filename}")
            return send_file(filepath, as_attachment=True, download_name=file.filename)

    tunnel = None
    try:
        threading.Thread(target=lambda: app.run(port=args.port, use_reloader=False), daemon=True).start()
        print("Starting tunnel...")
        tunnel = subprocess.Popen(
            ["cloudflared", "tunnel", "run", "--token", cf_token],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(
            f"\nSign server ready at: {tunnel_url}\n"
            f"\nEndpoint: POST /sign (multipart file upload)\n"
            f"\n  export SIGN_TUNNEL_URL={tunnel_url}\n"
            f"  export SIGN_TUNNEL_SECRET={secret}\n"
            f"  SIGN_ENABLED=true uv run scripts/sign.py sign main.exe\n"
            f"\nPress Ctrl+C to stop\n",
            flush=True,
        )
        tunnel.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        if tunnel:
            tunnel.kill()
            tunnel.wait()
        print("Cleaned up")


# --- entry --------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Windows code signing over a YubiKey: the server, and the client Tauri calls.")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="run the signing server behind a Cloudflare tunnel (on the YubiKey machine)")
    serve.add_argument("--port", type=int, default=8080, help="local port for the HTTP server (default 8080)")
    serve.set_defaults(func=cmd_serve)

    sign = sub.add_parser("sign", help="sign one file through the server (Tauri's Windows signCommand)")
    sign.add_argument("file", help="the binary to sign in place")
    sign.set_defaults(func=cmd_sign)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
