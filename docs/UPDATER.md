# Updater

Vibe updates from two channel files on the website, not from GitHub's latest release:

- `https://thewh1teagle.github.io/vibe/updater/stable.json`
- `https://thewh1teagle.github.io/vibe/updater/beta.json`

Each is the `latest.json` a release build produced. Everyone is on stable unless they turn on
Settings → General → Beta updates. The app side is `desktop/src-tauri/src/updater.rs`.

## Version numbers

A beta is a patch bump on the current line: with 3.3.0 on stable, betas are 3.3.1, 3.3.2 and so on,
each with its own short changelog entry. The real release takes the next minor number (3.4.0): a
fresh signed build of the last beta's code, with one changelog entry covering everything since the
previous stable release. Stable users then see a single jump with complete notes, and beta users
update to it like everyone else.

The changelog page marks every version newer than `stable.json` as Beta by itself, so nothing has
to be edited when a version is promoted.

## Shipping a release

```console
# after release.yml finished (the GitHub release is a prerelease)
uv run scripts/channel.py 3.3.0 --channel beta     # beta users first
uv run scripts/channel.py 3.3.0 --channel stable   # once beta looks fine
gh release edit v3.3.0 --prerelease=false --latest # last: older apps read GitHub
```

Commit `website/public/updater/` to main after each step; the website deploy publishes it in a
few minutes. Promoting to stable also moves beta forward, so beta is never behind stable.

The updater only moves forward. A bad release is fixed by shipping a newer one — which is what
beta is for: catch it before stable gets it.

Apps on 3.2.2 or older don't know about these files: they still update from whichever GitHub
release is marked "latest". So `gh release edit --latest` is what ships a version to them — run it
last, once the version is already on stable.
