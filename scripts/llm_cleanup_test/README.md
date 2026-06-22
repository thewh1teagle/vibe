# LLM cleanup — model evaluation

Compares candidate Groq chat models for STT transcript post-processing.

## What it does

Runs the same 18 Danish STT samples through each model with a fixed system prompt and writes:

- `results/comparison.md` — side-by-side per-input output
- `results/summary.md` — latency ranking (avg, p50, p90, min, max)
- `results/raw.json` — full data for further analysis

## Run

```bash
export GROQ_API_KEY=gsk_...
uv run scripts/llm_cleanup_test/compare.py
```

Set `MODELS` in `compare.py` to add or remove candidates. Edit `prompt.txt` and `test_inputs.txt` freely — both are loaded at runtime.

## Findings (as of v1.2.0)

`llama-3.3-70b-versatile` is the default in the app because:

- It preserves meaning strictly — no hallucinated sentences
- p50 latency ~170ms, on par with the 8b models
- 12K TPM — well within free-tier limits

Models that lost the bake-off:

- `llama-3.1-8b-instant` — occasionally hallucinated extra sentences ("Først skal vi se, om der er nogen ændringer i TypeScript-kode...") when the input was a short prompt
- `qwen/qwen3-32b` and `qwen/qwen3.6-27b` — both leak `<think>` reasoning into the output, which the app would have to filter
- `allam-2-7b` — translated Danish to English on several inputs
- `gemma2-9b-it` — decommissioned
