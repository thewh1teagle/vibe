# Plan: Fix hardcoded colors and dark mode issues

## Context

The shadcn migration replaced DaisyUI class names but left behind hardcoded Tailwind color classes (`bg-green-600`, `text-red-500`, `stroke-white`, etc.) and inline hex values (`#1565c0`, `#db61a2`) that don't adapt to dark/light mode. These cause visible light-mode elements on dark backgrounds and inconsistent coloring throughout.

shadcn's color system uses semantic CSS variables (`--primary`, `--destructive`, `--muted`, etc.) that automatically adjust for dark mode. All hardcoded colors should be replaced with these.

---

## Issue 1: Hardcoded red → `text-destructive`

Cancel/abort buttons use `text-red-500 hover:text-red-600` instead of the semantic destructive color.

### 1a. `pages/home/Page.tsx` line 154

```
text-red-500 hover:text-red-600
```
→
```
text-destructive hover:text-destructive/80
```

### 1b. `pages/home/ProgressPanel.tsx` line 25

```
text-red-500 hover:text-red-600
```
→
```
text-destructive hover:text-destructive/80
```

---

## Issue 2: Hardcoded green + white on batch play/stop buttons

### 2a. `pages/home/Page.tsx` line 75 — "Stop and Transcribe" button

```
className="mt-3 bg-green-600 hover:bg-green-700 text-white"
```

**Problem:** `bg-green-600` doesn't exist in the semantic system. `text-white` is hardcoded.

**Fix:** Define custom `--success` and `--success-foreground` CSS variables in `globals.css`, then use them:

Add to `globals.css` `:root` block:
```css
--success: oklch(0.60 0.15 145);
--success-foreground: oklch(1.00 0 0);
```

Add to `.dark` block:
```css
--success: oklch(0.50 0.15 145);
--success-foreground: oklch(1.00 0 0);
```

Add to `@theme inline`:
```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
```

Then the button becomes:
```
className="mt-3 bg-success hover:bg-success/90 text-success-foreground"
```

### 2b. `pages/batch/BatchPanel.tsx` line 50-51 — Play/Cancel circle buttons

```tsx
className={inProgress ? 'cursor-pointer p-2 rounded-full bg-destructive' : 'cursor-pointer p-2 rounded-full bg-green-600'}
```
Icons:
```tsx
<CancelIcon className="h-5 w-5 stroke-white" />
<PlayIcon className="h-5 w-5 stroke-white stroke-2" />
```

**Fix:**
```tsx
className={inProgress ? 'cursor-pointer p-2 rounded-full bg-destructive' : 'cursor-pointer p-2 rounded-full bg-success'}
```
Icons:
```tsx
<CancelIcon className="h-5 w-5 stroke-destructive-foreground" />
<PlayIcon className="h-5 w-5 stroke-success-foreground stroke-2" />
```

### 2c. `pages/batch/BatchQueue.tsx` line 20 — Check icon

```
stroke-green-600
```
→
```
stroke-success
```

---

## Issue 3: Hardcoded hex in HtmlView inline styles

### `components/HtmlView.tsx` line 34

```tsx
color: '#1565c0'
```

**Problem:** Hardcoded blue hex in inline style — doesn't adapt to dark mode.

**Fix:** Use CSS variable:
```tsx
color: 'var(--primary)'
```

The full style block at line 31-40 should also be audited. The inline styles are fine for the print/HTML export use case, but the title color must be theme-aware.

---

## Issue 4: Hardcoded pink hex on heart icon

### `pages/settings/Page.tsx` line 136

```tsx
<HeartIcon fill="#db61a2" className="w-4 h-4 stroke-2" />
```

**Problem:** `#db61a2` is a hardcoded pink. While this is arguably a brand color (GitHub sponsor pink), it should at minimum work visually in both modes.

**Fix:** Use `fill="currentColor"` with a pink that works in both themes, or use the CSS variable approach:
```tsx
<HeartIcon className="w-4 h-4 stroke-2 fill-pink-500" />
```

`fill-pink-500` is a Tailwind utility that works reasonably in both modes. Alternatively, keep it as-is if it's intentionally branded — `#db61a2` is visible on both light and dark backgrounds.

**Verdict:** Low priority. Keep `fill="#db61a2"` — it's an intentional brand color that's visible in both modes.

---

## Issue 5: Dialog overlay hardcoded black

### `components/ui/dialog.tsx` line 22

```
bg-black/80
```

**Problem:** Hardcoded black overlay. While `bg-black/80` technically works in both modes (dark overlay is appropriate for both), it's inconsistent with the semantic system.

**Fix:** This is actually fine for a modal overlay — a dark scrim is correct UX for both light and dark modes. **No change needed.**

---

## Issue 6: `DropModal.tsx` uses old `cx()` function

### `components/DropModal.tsx` line 79

```tsx
import { cx, formatLongString, validPath } from '~/lib/utils'
// ...
className={cx('fixed inset-0 backdrop-blur-sm bg-background/60 z-50', open ? 'block' : 'hidden')}
```

**Problem:** Uses old `cx()` instead of the new `cn()`. If `cx` was removed from utils.ts, this will error. If it wasn't removed, it's an inconsistency.

**Fix:** Replace `cx` with `cn` in the import and usage.

---

## Issue 7: AudioPlayer unstyled play/pause button

### `pages/home/AudioPlayer.tsx` line 93

```tsx
<button className="text-1xl absolute bottom-1 left-1/2 -translate-x-1/2" onMouseDown={...}>
```

**Problems:**
- `text-1xl` is not a valid Tailwind class (should be `text-xl`)
- No hover/focus states
- No cursor-pointer
- Raw `<button>` instead of shadcn Button

**Fix:**
```tsx
<button className="absolute bottom-1 left-1/2 -translate-x-1/2 cursor-pointer text-foreground hover:text-primary transition-colors" onMouseDown={...}>
```

---

## Summary of all changes

### `globals.css` — add success color variables

Add to `:root`:
```css
--success: oklch(0.60 0.15 145);
--success-foreground: oklch(1.00 0 0);
```

Add to `.dark`:
```css
--success: oklch(0.50 0.15 145);
--success-foreground: oklch(1.00 0 0);
```

Add to `@theme inline`:
```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
```

### Files changed

| File | Line(s) | Change |
|-|-|-|
| `src/globals.css` | `:root`, `.dark`, `@theme` | Add `--success` / `--success-foreground` variables |
| `src/pages/home/Page.tsx` | 75 | `bg-green-600 hover:bg-green-700 text-white` → `bg-success hover:bg-success/90 text-success-foreground` |
| `src/pages/home/Page.tsx` | 154 | `text-red-500 hover:text-red-600` → `text-destructive hover:text-destructive/80` |
| `src/pages/home/ProgressPanel.tsx` | 25 | `text-red-500 hover:text-red-600` → `text-destructive hover:text-destructive/80` |
| `src/pages/batch/BatchPanel.tsx` | 50 | `bg-green-600` → `bg-success` |
| `src/pages/batch/BatchPanel.tsx` | 51 | `stroke-white` → `stroke-destructive-foreground` / `stroke-success-foreground` |
| `src/pages/batch/BatchQueue.tsx` | 20 | `stroke-green-600` → `stroke-success` |
| `src/components/HtmlView.tsx` | 34 | `color: '#1565c0'` → `color: 'var(--primary)'` |
| `src/components/DropModal.tsx` | 1, 79 | `cx` → `cn` |
| `src/pages/home/AudioPlayer.tsx` | 93 | Fix invalid `text-1xl`, add `cursor-pointer`, `text-foreground`, `hover:text-primary` |

### No change needed

| File | Line | Why |
|-|-|-|
| `src/components/ui/dialog.tsx` | 22 | `bg-black/80` overlay is correct UX for both modes |
| `src/pages/settings/Page.tsx` | 136 | `fill="#db61a2"` is intentional brand color, visible in both modes |
