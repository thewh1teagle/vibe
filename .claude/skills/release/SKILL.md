---
name: release
description: Ship a Vibe release end to end — decide whether server/ needs its own release first, bump the version, PR and squash-merge, start the Windows sign server, run release.yml with signing, promote the prerelease, deploy the website. Use when the user asks to cut, ship or publish a release, or invokes /release.
---

# Release

Seven steps; stable comes later, when the user says so. Each has a gate — do not start the next one until the gate is green.
Report the version, the run URLs and the gate results as you go; ask before
skipping a step.

## 0. Preflight

```
git switch main && git pull --ff-only
git status --short          # must be empty
```

## 1. Does `server/` need a release first?

The desktop app downloads a pinned engine, so engine fixes only reach users
through a new server release.

```
pin=$(cat .server-version)                          # e.g. v0.6.9
git log --oneline "server-${pin#v}"..main -- server/ 2>/dev/null ||
  git log --oneline "server-$pin"..main -- server/
```

- **No commits** → skip to step 2, leave `.server-version` alone.
- **Only docs/comments** → say so and ask whether to skip.
- **Code changed** → release the server first:
  - If anything under `server/libs/` changed (`ggml-version`, `patches/`,
    `libs.chore`, `include/`), bump `server/libs/revision` in the same commit and
    run `server-libs.yml` **first** (~9 min); `upload-libs` refuses a tag that
    exists for another tree.
  - `git tag server-vX.Y.Z && git push origin server-vX.Y.Z` on main.
  - **Gate:** `server-release.yml` green (~8 min) and all 5 assets uploaded — the
    Intel Mac asset lands last. It publishes as a *prerelease* on purpose; leave
    it that way so Latest stays with the app.

## 2. Bump and write the notes

Pick the number first (`docs/UPDATER.md`, "Version numbers"): a beta is a patch bump on the
current line (3.3.1, 3.3.2). Stable is either the last beta promoted as it is, or the next minor
(3.4.0) as a fresh build whose changelog entry covers everything since the previous stable release.

Three files, one commit:

- `desktop/src-tauri/tauri.conf.json` → `"version"`.
- `.server-version` → the new server tag minus `server-` (only if step 1 released one).
- `i18n/changelog/<version>.md`. **release.yml fails without it.**

If that file does not exist, write it. Read what actually shipped —
`git log --oneline <previous tag>..main` and the PR bodies — and write the entry
the way its neighbours are written: frontmatter (`version`, `date`, `title`), then
`## New` / `## Improved` / `## Fixed` sections of `- 🎯 **Term** — what changed`
bullets, keeping the `(#1234)` refs and `@handle` credits. Read the last two
entries first and match their voice: plain, concrete, user-visible. A refactor
nobody can see does not get a bullet.

Then translate it: invoke the `translate` skill, which fans one cheap subagent per
locale over the new file and stamps the hashes. Untranslated is not fatal — the
page falls back to English per entry — but the notes are the one page every user
opens on update day, so translate them unless the user says otherwise.

**Gate:** `uv run scripts/check_i18n.py` passes and `chore check-types` is clean.

## 3. PR and squash merge

Commit title style: `Bump version to X, and <feature> (#PR)`.

```
git switch -c release/vX.Y.Z && git commit && git push -u origin HEAD
gh pr create --fill
```

**Gate:** `fmt` and `clippy` pass, then `gh pr merge <n> --squash --delete-branch`.
Repo-level auto-merge is **off** (`allow_auto_merge: false`), so `--auto` silently
does nothing — poll the checks and merge when they settle. Then `git switch main
&& git pull`.

## 4. Start the sign server

The Windows job reaches a YubiKey on this machine through a Cloudflare tunnel.

```
uv run --env-file .env.local scripts/sign.py serve      # background
curl "$TUNNEL_URL/"                                     # {"status":"ok"}
```

Values live only in `.env.local` (gitignored) — pass the file, never print or copy
the values. The server prints a ready-to-paste `export SIGN_TUNNEL_SECRET=…` line
at startup, so whatever you redirect its output to holds a live secret: keep that
log outside the repo and delete it when the release is done.

Check the tunnel with **curl**, not urllib or requests — Cloudflare answers a
non-browser user-agent with `403 error code: 1010`, which looks exactly like a dead
tunnel.

**Gate:** the curl returns `{"status":"ok"}`. Never trigger step 5 before it does —
an unsigned Windows build ships a SmartScreen warning to every user.

## 5. Release

```
gh workflow run release.yml --ref main -f sign-windows=true -f sign-macos=true
```

~20 min. tauri-action creates the tag `vX.Y.Z` and a **prerelease**.

**Gate:** all 5 platform jobs green, and `[sign] OK: vibe.exe` in the Windows job
log. A single failed platform can be re-run with `gh run rerun <id> --failed`.

## 6. Roll out

Users update from `website/public/updater/<channel>.json`, not GitHub. Details in
`docs/UPDATER.md`.

```
uv run scripts/channel.py X.Y.Z --channel beta
```

Commit it through a PR (main rejects direct pushes; it only touches `website/public/updater/`) and
merge; the website deploy publishes it. **Stop here and tell the user** — stable comes after beta
has run for a day or two, and the user decides when. Promotion is one pass with one deploy at the
end (`docs/UPDATER.md`, "Promoting to stable"):

```
uv run scripts/channel.py X.Y.Z --channel stable    # PR, merge
gh release edit vX.Y.Z --prerelease=false --latest  # the website and pre-channel apps read this
gh workflow run website.yml --ref main              # then verify the channel files and the download button
```

If earlier betas were skipped on stable, the promoted version's changelog entry should carry their
items. Do not write release notes — the body is already a link to
`https://thewh1teagle.github.io/vibe/changelog/<version>`.

## 7. Deploy the website and stop the sign server

```
gh workflow run website.yml --ref main
pkill -f 'sign.py serve'
```

The website also deploys on `release: published`, but trigger it explicitly so the
changelog page carries the new entry without waiting.

**Gate:** `website.yml` green, and `https://thewh1teagle.github.io/vibe/changelog/<version>`
serves the new entry.
