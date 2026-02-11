#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx==0.28.1",
#     "pyjwt==2.11.0",
#     "python-dotenv==1.0.1",
# ]
# ///

"""
Export Aptabase events to CSV or Parquet.

Env vars (via .env):
  BASE_URL        – e.g. https://aptabase.example.com
  AUTH_SECRET     – same secret the server uses to verify JWTs
  AUTH_NAME       – your account name
  AUTH_EMAIL      – your account email
  APP_KEY         – default app key (e.g. A-SH-0194598703)
  APTABASE_REGION – optional, defaults to "SH"

Usage:
  uv run export_data.py \
    --start-date 2025-01-01 \
    --end-date 2025-02-01

  # optional flags
    --app-key A-SH-...   (overrides APP_KEY from .env)
    --format csv|parquet   (default: csv)
    --build-mode release|debug   (default: release)
    --output custom-name.csv
"""

import argparse
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx
import jwt
from dotenv import load_dotenv
import os

load_dotenv()


def require_env(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise SystemExit(f"Missing {key} in .env")
    return value


def build_token(auth_secret: str, region: str, name: str, email: str) -> str:
    now = int(time.time())
    issuer = f"aptabase-{region.strip().lower()}"
    payload = {
        "type": "SignIn",
        "name": name,
        "email": email,
        "exp": now + 600,  # 10 minutes
        "iat": now,
        "iss": issuer,
    }
    return jwt.encode(payload, auth_secret, algorithm="HS256")


def authenticate(client: httpx.Client, base_url: str, token: str) -> None:
    """Hit the magic-link endpoint to obtain the auth-session cookie."""
    url = f"{base_url}/api/_auth/continue?token={quote(token, safe='')}"
    resp = client.get(url, follow_redirects=False)

    if resp.status_code not in (301, 302, 303, 307, 308):
        raise SystemExit(
            f"Auth failed: expected redirect, got {resp.status_code}\n{resp.text[:500]}"
        )

    if "auth-session" not in client.cookies:
        raise SystemExit("Auth failed: no auth-session cookie received")

    print("Authenticated successfully.")


def resolve_app_key(
    client: httpx.Client, base_url: str, app_key: str
) -> tuple[str, str]:
    """Resolve an app key (A-SH-...) to internal (id, name) via /api/_apps."""
    resp = client.get(f"{base_url}/api/_apps")
    if resp.status_code != 200:
        raise SystemExit(f"Failed to list apps ({resp.status_code}): {resp.text[:500]}")

    for app in resp.json():
        if app["appKey"] == app_key:
            return app["id"], app["name"]

    available = ", ".join(f"{a['appKey']} ({a['name']})" for a in resp.json())
    raise SystemExit(f"App key {app_key!r} not found. Available: {available}")


def export_data(
    client: httpx.Client,
    base_url: str,
    *,
    app_id: str,
    app_name: str,
    build_mode: str,
    fmt: str,
    start_date: str,
    end_date: str,
    output: Path,
) -> None:
    params = {
        "appId": app_id,
        "buildMode": build_mode,
        "appName": app_name,
        "format": fmt,
        "startDate": start_date,
        "endDate": end_date,
    }
    url = f"{base_url}/api/_export/download?{urlencode(params)}"

    print(f"Downloading {fmt} export for {start_date} → {end_date} ...")

    with client.stream("GET", url) as resp:
        if resp.status_code != 200:
            resp.read()
            raise SystemExit(f"Export failed ({resp.status_code}): {resp.text[:500]}")

        with open(output, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=65536):
                f.write(chunk)

    size_kb = output.stat().st_size / 1024
    print(f"Saved to {output} ({size_kb:.1f} KB)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Aptabase events")
    parser.add_argument(
        "--app-key",
        default=os.environ.get("APP_KEY"),
        help="App key e.g. A-SH-... (default: APP_KEY from .env)",
    )
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--format", choices=["csv", "parquet"], default="csv")
    parser.add_argument("--build-mode", choices=["release", "debug"], default="release")
    parser.add_argument("--output", help="Output filename (auto-generated if omitted)")
    args = parser.parse_args()

    # validate dates
    for d in (args.start_date, args.end_date):
        try:
            datetime.strptime(d, "%Y-%m-%d")
        except ValueError:
            raise SystemExit(f"Invalid date format: {d} (expected YYYY-MM-DD)")

    if not args.app_key:
        raise SystemExit("Missing --app-key (and no APP_KEY in .env)")

    base_url = require_env("BASE_URL").rstrip("/")
    auth_secret = require_env("AUTH_SECRET")
    name = require_env("AUTH_NAME")
    email = require_env("AUTH_EMAIL")
    region = os.environ.get("APTABASE_REGION", "SH")

    token = build_token(auth_secret, region, name, email)

    with httpx.Client(timeout=300) as client:
        authenticate(client, base_url, token)
        app_id, app_name = resolve_app_key(client, base_url, args.app_key)
        print(f"Resolved {args.app_key} → {app_name} ({app_id})")

        ext = "parquet" if args.format == "parquet" else "csv"
        output = Path(
            args.output
            or f"{app_name}-{args.build_mode}-{args.start_date}-{args.end_date}.{ext}"
        )

        export_data(
            client,
            base_url,
            app_id=app_id,
            app_name=app_name,
            build_mode=args.build_mode,
            fmt=args.format,
            start_date=args.start_date,
            end_date=args.end_date,
            output=output,
        )


if __name__ == "__main__":
    main()
