---
name: translate
description: Translate anything under i18n/ into the project's locales with parallel subagents — desktop and website catalogs, changelog entries, docs pages — then verify the structure, stamp the source hashes and run the audit. Use when the user asks to translate strings, release notes or docs, to fill missing locale keys, or invokes /translate.
---

# Translate

```
i18n/desktop/<locale>.json          app strings      22 locales (desktop: true)
i18n/website/<locale>.json          site strings     15 locales (website: true)
i18n/changelog/<version>.md         release notes    English at the top level,
i18n/changelog/<locale>/<version>.md                 translations under a locale dir
i18n/docs/en-US/<slug>.md           docs pages       same shape
i18n/docs/<locale>/<slug>.md
```

`i18n/locales.json` is the roster — filter on `desktop` / `website`. Never edit
`en-US`; it is the source. A missing translation falls back to English whole, so
partial coverage is safe to ship.

## 1. Find what is missing

```bash
uv run scripts/check_i18n.py        # catalogs, changelog and docs coverage
```

For catalogs, the per-locale gap:

```bash
uv run python - <<'PY'
import json, pathlib
en = json.load(open("i18n/desktop/en-US.json"))
for p in sorted(pathlib.Path("i18n/desktop").glob("*.json")):
    if p.stem == "en-US": continue
    missing = [k for k in en if k not in json.load(open(p))]
    if missing: print(p.stem, len(missing))
PY
```

## 2. Fan out — one subagent per locale

Write the brief **once** to a scratch file, then spawn one cheap subagent
(`model: sonnet`) per locale in a **single message**, each pointing at that file
and naming only its own locale and output path. Never translate locale after
locale yourself; that is hours of serial work for no gain.

The brief must carry these rules — every one of them was a real defect at some
point:

- **Placeholders byte-identical:** `{count}`, `{version}`, `{name}`… Never
  translate what is inside braces, never reorder them.
- **Structural markers stay English:** the `## New` / `## Improved` / `## Fixed`
  headings are markers the page maps to translated badges. Same headings, same
  order, same bullet count as the source.
- **Frontmatter:** `version` and `date` byte-identical to the English file; only
  `title` is translated. Never write a `source:` line — step 4 stamps it.
- **UI paths are translated, including inside backticks.** `Settings → Models`
  names menu items in an app that *is* translated, so it becomes
  `הגדרות → מודלים` — backticks and the `→` kept. Look the words up in
  `i18n/desktop/<locale>.json` so the docs match the app.
- **Everything else in backticks stays English, byte for byte:** filenames,
  flags, env vars, quoted error text, and *placeholders inside example URLs* —
  `vibe://download?url=<any model url>` is a string the reader copies, not prose.
- **Real backticks**, not `「」` or `""` — the page renders backticks as code.
- **Verbatim:** emoji, `(#1234)` refs, `@handles`, URLs and link targets (translate
  link *text* only), version numbers, and product/technical names (Vibe, Whisper,
  ggml, FFmpeg, AVX2, CoreML, Vulkan, macOS…). Never drop a contributor credit.
- **Match the existing locale file** for tone and terminology — tell the agent to
  read two or three finished files in its own locale first.
- Keep UI labels short; keep terse source terse.

Ask each agent to verify its own output and report what it was unsure about, but
verify again yourself — agents report success on files that drifted.

## 3. Verify the structure yourself

```bash
uv run python - <<'PY'
import json, pathlib, re
en = json.load(open("i18n/desktop/en-US.json"))
ph = lambda s: sorted(re.findall(r"{[^}]*}", s))
for p in sorted(pathlib.Path("i18n/desktop").glob("*.json")):
    if p.stem == "en-US": continue
    d = json.load(open(p))
    bad = [k for k in d if k in en and ph(en[k]) != ph(d[k])]
    extra = [k for k in d if k not in en]
    if bad or extra: print(p.stem, "placeholders:", bad, "extra keys:", extra)
PY
```

For Markdown, compare each translation to its English source: heading levels,
section names, bullet counts per section, fenced code blocks (identical except
prose `#` comments), `(#1234)` refs, `@handles`, link targets, and code spans that
are not UI paths. Report every mismatch and fix the real ones by hand rather than
re-running an agent.

## 4. Stamp and audit

```bash
chore stamp-translations            # writes the source hash into each translation
uv run scripts/check_i18n.py        # must end "i18n audit passed"
```

The hash is what makes a later edit to the English original show up as stale
instead of drifting silently. Adding a catalog key also needs
`cd desktop && pnpm i18n:generate` (and the same in `website/`) before the app
type-checks.
