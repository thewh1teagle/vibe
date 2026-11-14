# Updater

Vibe updates from two channel files on the website, not from GitHub's latest release:

- `https://thewh1teagle.github.io/vibe/updater/stable.json`
- `https://thewh1teagle.github.io/vibe/updater/beta.json`

Each is the `latest.json` a release build produced. Everyone is on stable unless they turn on
Settings → General → Beta updates. The app side is `desktop/src-tauri/src/updater/`.

## How the app updates

All of it is in `desktop/src-tauri/src/updater/`. The webview only shows the `update-state` it
publishes.

| Step | What happens |
|---|---|
| Check | 20 seconds after launch, then every 4 hours, tray included |
| Download | In the background, signature checked, kept in the app cache |
| Offer | The dot in the sidebar, at once |
| Reminder | Still waiting after 2 days: a banner in the app. "Later" hides it for 5 days |
| Install | Only when the user clicks. Restarts in front, one toast: "Vibe was updated to X" |

Nothing installs by itself: an install restarts the app, and only the user knows when that is fine.

Settings → General: "Download updates automatically" (on). Off: nothing downloads until the click.

Development and e2e builds never check on a schedule.

Telemetry: `update_applied`, `update_failed` (`stage`: `install` or `relaunch`).

In an e2e build, without a real update:

```console
chore e2e js "window.__TAURI__.core.invoke('update_simulate_relaunch'); return 1"
chore e2e js "window.__TAURI__.core.invoke('update_simulate_state', {state: {phase: 'ready', currentVersion: '3.3.6', version: '3.3.7', interactive: false, remind: true}}); return 1"
```

## Version numbers

A beta is a patch bump on the current line: with 3.3.0 on stable, betas are 3.3.1, 3.3.2 and so on,
each with its own changelog entry. Going stable is one of two things:

- **Promote the last beta as it is** (3.3.2 becomes stable). Users get the exact build beta tested.
  Its changelog entry should carry the earlier betas' items too, because a stable user is linked
  only to that one entry.
- **Cut the next minor** (3.4.0): a fresh signed build of the same code with one entry covering
  everything since the previous stable release.

The changelog page marks every version newer than `stable.json` as Beta by itself, so nothing has
to be edited when a version is promoted.

## Shipping a release

```console
# after release.yml finished (the GitHub release is a prerelease)
uv run scripts/channel.py 3.3.2 --channel beta     # commit, merge; the push deploys the website
```

Let a beta sit for a day or two, and hear from at least one Windows user, before promoting it.

## Promoting to stable

One pass, one website deploy at the end, so apps and the download page switch together:

```console
uv run scripts/channel.py 3.3.2 --channel stable   # commit and merge website/public/updater/
gh release edit v3.3.2 --prerelease=false --latest # before the deploy: the website reads it
gh workflow run website.yml --ref main             # one deploy publishes all of it
```

The merge itself starts a deploy; mark the release latest right after merging and the run started
by hand picks it up. Promoting to stable also moves beta forward, so beta is never behind stable.
Check afterwards: both `updater/*.json` files and the download button show the new version.

The updater only moves forward. A bad release is fixed by shipping a newer one — which is what
beta is for: catch it before stable gets it.

Apps on 3.2.2 or older don't know about these files: they still update from whichever GitHub
release is marked "latest". So `gh release edit --latest` is what ships a version to them, and
what the website's download button follows.
