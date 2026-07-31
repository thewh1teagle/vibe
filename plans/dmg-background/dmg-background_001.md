# DMG Background Fix

## Problem

DMG background image overflowed the window — icons and text cut off.

## What didn't work

- Resizing image to 1x (720x326 at 72 DPI) — background didn't render correctly.

## What worked

Matched Docker's DMG setup exactly:

- **Image**: 1440x652 px (2x retina) at **144 DPI**
- **Window**: 720x340
- **Icon positions**: `appPosition` and `applicationFolderPosition` in Tauri config

## Reference: Docker.dmg

Extracted from `/Volumes/Docker 1/.DS_Store`:

- Window: `{{300, 800}, {720, 340}}`
- Docker.app icon: (145, 130)
- Applications folder: (560, 130)
- Background: 1440x652 at 144 DPI
- Icon size: 128

## Config

`desktop/src-tauri/tauri.macos.conf.json`:

```json
"dmg": {
  "background": "../../design/dmg_background.png",
  "appPosition": { "x": 145, "y": 130 },
  "applicationFolderPosition": { "x": 560, "y": 130 },
  "windowSize": { "height": 340, "width": 720 }
}
```

## Regenerating the background PNG

```bash
rsvg-convert -w 1440 -h 652 design/dmg_background.svg -o design/dmg_background.png
sips -s dpiWidth 144 -s dpiHeight 144 design/dmg_background.png
```

## Rule

- Image must be 1440x652 at 144 DPI (2x retina for 720x340 window)
- Source SVG: `design/dmg_background.svg`
