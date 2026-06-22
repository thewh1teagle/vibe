#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
PROMPT_PATH = SCRIPT_DIR / "prompt.txt"
INPUTS_PATH = SCRIPT_DIR / "test_inputs.txt"
RESULTS_DIR = SCRIPT_DIR / "results"

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "allam-2-7b",
]

TEMPERATURE = 0.0
MAX_TOKENS = 1024
TIMEOUT_SEC = 30.0
INTER_REQUEST_DELAY_SEC = 1.5
INTER_MODEL_DELAY_SEC = 5.0
MAX_RETRIES = 3


def load_inputs() -> list[str]:
    lines = INPUTS_PATH.read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def load_system_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").rstrip()


def call_model(client: httpx.Client, api_key: str, model: str, system_prompt: str, text: str) -> tuple[str, float, int, int | None]:
    payload = {
        "model": model,
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        start = time.perf_counter()
        try:
            resp = client.post(GROQ_CHAT_URL, json=payload, headers=headers, timeout=TIMEOUT_SEC)
        except httpx.HTTPError as e:
            last_err = e
            time.sleep(2 * attempt)
            continue
        elapsed = time.perf_counter() - start

        if resp.status_code == 429:
            retry_after = float(resp.headers.get("retry-after", 2 * attempt))
            time.sleep(retry_after)
            continue

        if not resp.is_success:
            err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            raise RuntimeError(err)

        body = resp.json()
        content = body["choices"][0]["message"]["content"].strip()
        usage = body.get("usage", {})
        tokens = usage.get("total_tokens", 0)
        completion_tokens = usage.get("completion_tokens")
        return content, elapsed, tokens, completion_tokens

    raise RuntimeError(f"failed after {MAX_RETRIES} retries: {last_err}")


def main() -> int:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("error: GROQ_API_KEY env var is not set", file=sys.stderr)
        return 1

    inputs = load_inputs()
    system_prompt = load_system_prompt()
    RESULTS_DIR.mkdir(exist_ok=True)

    print(f"loaded {len(inputs)} test inputs")
    print(f"testing {len(MODELS)} models:")
    for m in MODELS:
        print(f"  - {m}")
    print()

    results: dict[str, list[dict]] = {model: [] for model in MODELS}
    total_elapsed_by_model: dict[str, list[float]] = {model: [] for model in MODELS}

    with httpx.Client() as client:
        for model_idx, model in enumerate(MODELS):
            print(f"=== {model} ===")
            for idx, text in enumerate(inputs, 1):
                try:
                    output, elapsed, tokens, completion_tokens = call_model(client, api_key, model, system_prompt, text)
                except Exception as e:
                    print(f"  [{idx:>2}] ERROR {e}")
                    output, elapsed, tokens, completion_tokens = f"<error: {e}>", 0.0, 0, None
                results[model].append(
                    {
                        "input": text,
                        "output": output,
                        "elapsed_sec": round(elapsed, 3),
                        "total_tokens": tokens,
                        "completion_tokens": completion_tokens,
                    }
                )
                total_elapsed_by_model[model].append(elapsed)
                ct = f"{completion_tokens:>4}t" if completion_tokens is not None else "    ?t"
                print(f"  [{idx:>2}] {elapsed * 1000:>6.0f}ms  {tokens:>5}t  {ct}  in:  {text[:50]}{'...' if len(text) > 50 else ''}")
                time.sleep(INTER_REQUEST_DELAY_SEC)
            print()
            if model_idx < len(MODELS) - 1:
                print(f"  (waiting {INTER_MODEL_DELAY_SEC}s for rate limit window to reset...)")
                time.sleep(INTER_MODEL_DELAY_SEC)
                print()

    raw_path = RESULTS_DIR / "raw.json"
    raw_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {raw_path.relative_to(SCRIPT_DIR.parent.parent)}")

    md_path = RESULTS_DIR / "comparison.md"
    md_path.write_text(format_markdown(inputs, results), encoding="utf-8")
    print(f"wrote {md_path.relative_to(SCRIPT_DIR.parent.parent)}")

    summary_path = RESULTS_DIR / "summary.md"
    summary_path.write_text(format_summary(total_elapsed_by_model, results), encoding="utf-8")
    print(f"wrote {summary_path.relative_to(SCRIPT_DIR.parent.parent)}")

    return 0


def format_markdown(inputs: list[str], results: dict[str, list[dict]]) -> str:
    lines: list[str] = []
    lines.append("# LLM cleanup — model comparison\n")
    lines.append("Generated by `scripts/llm_cleanup_test/compare.py`.\n")
    lines.append("Open `summary.md` for the latency ranking.\n")

    for idx, text in enumerate(inputs):
        lines.append(f"## Input {idx + 1}\n")
        lines.append(f"> {text}\n")
        for model in MODELS:
            r = results[model][idx]
            elapsed = r["elapsed_sec"] * 1000
            lines.append(f"### `{model}` — {elapsed:.0f}ms, {r['total_tokens']} tokens\n")
            lines.append(f"{r['output']}\n")
        lines.append("---\n")
    return "\n".join(lines)


def format_summary(elapsed_by_model: dict[str, list[float]], results: dict[str, list[dict]]) -> str:
    lines: list[str] = []
    lines.append("# LLM cleanup — latency summary\n")
    lines.append("| Model | Calls | Avg ms | P50 ms | P90 ms | Min ms | Max ms |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    ranked = sorted(
        MODELS,
        key=lambda m: (sum(elapsed_by_model[m]) / max(len(elapsed_by_model[m]), 1)),
    )
    for model in ranked:
        timings = [t * 1000 for t in elapsed_by_model[model] if t > 0]
        if not timings:
            continue
        timings_sorted = sorted(timings)
        n = len(timings_sorted)
        avg = sum(timings) / n
        p50 = timings_sorted[n // 2]
        p90 = timings_sorted[min(int(n * 0.9), n - 1)]
        mn = timings_sorted[0]
        mx = timings_sorted[-1]
        lines.append(f"| `{model}` | {n} | {avg:.0f} | {p50:.0f} | {p90:.0f} | {mn:.0f} | {mx:.0f} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
