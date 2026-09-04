# Event And Error Discovery

Do not hardcode bucket names or assume the event set is stable.

Derive the current analysis from the repository and the current export each time.

## 1. Discover the current events from code

Before interpreting the CSV, read the analytics definitions in the repo:

- `desktop/src-tauri/src/analytics.rs`
- `desktop/src/lib/analytics.ts`

Use those files as the source of truth for which events exist right now. If the repository changes, the analysis should follow the code, not an old reference file.

## 2. Start from the exported data

Inspect:

- `event_name`
- `app_version`
- `os_name`
- `os_version`
- `string_props`
- `numeric_props`

Use small inline pandas scripts to print:

- event counts
- unique users by event
- failures by OS and app version
- top raw error strings from `string_props`

## 3. Build buckets from current evidence

When failures exist, cluster them from the current raw error messages instead of reusing a fixed taxonomy.

Useful broad classes:

- runtime failures
- environment or packaging failures
- user-input or UX failures
- upstream service or busy-state failures

Name buckets based on the current dominant patterns in the export. Keep the names descriptive, but do not assume future wording will match past exports.

## 4. Map findings back to code

After identifying the dominant current failures, inspect the relevant code paths:

- `desktop/src-tauri/src/server/` for spawn, process lifecycle, load-model, and transcribe request issues
- `desktop/src-tauri/src/cmd/mod.rs` for input validation and surfaced command errors
- any other current call sites that emit analytics props or errors

Use the current code and current export together. The CSV tells you what is failing; the repo tells you where those failures are produced.

## 5. Keep the report resilient

The report should always:

- state the exact time window and filters used
- distinguish raw error rate from likely runtime reliability
- report affected users, not only error event volume
- call out repeated failures from a small number of users
- explain which parts of the codebase are most likely responsible
