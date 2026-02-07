# Plan: Migrate from DaisyUI to shadcn/ui

## Context

Vibe's frontend uses DaisyUI v5 on Tailwind CSS v4 for all UI components. The DaisyUI integration is currently broken. This plan replaces DaisyUI entirely with shadcn/ui using the latest syntax, default theme/colors, and Radix UI primitives. The app uses React 19, Vite 7, and React Router 7.

### Current DaisyUI usage summary

| DaisyUI component                               | Files using it | shadcn replacement                                              |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `btn` variants                                  | ~20 files      | `Button`                                                        |
| `modal`, `modal-open`, `modal-box`              | 6 files        | `Dialog`                                                        |
| `dropdown`, `dropdown-content`, `menu`          | 3 files        | `DropdownMenu`                                                  |
| `collapse`, `collapse-open`, `collapse-content` | 5 files        | `Collapsible`                                                   |
| `form-control`, `label`, `label-text`           | 15 files       | `Label` + layout divs                                           |
| `input`, `input-bordered`                       | 10 files       | `Input`                                                         |
| `select`, `select-bordered`                     | 10 files       | native `<select>` with shadcn styling or `Select`               |
| `textarea`, `textarea-bordered`                 | 5 files        | `Textarea`                                                      |
| `toggle`, `toggle-primary`                      | 8 files        | `Switch`                                                        |
| `progress`, `progress-primary`                  | 5 files        | `Progress`                                                      |
| `tabs`, `tab`, `tab-active`                     | 2 files        | `Tabs`                                                          |
| `tooltip`, `tooltip-bottom`                     | 5 files        | `Tooltip`                                                       |
| `toast`, `alert`                                | 2 files        | `Sonner` (toast)                                                |
| `swap`, `swap-rotate`                           | 2 files        | custom or `Toggle`                                              |
| `loading`, `loading-spinner`                    | 3 files        | `Spinner`                                                       |
| `link`, `link-primary`                          | 5 files        | Tailwind utility classes                                        |
| `badge`                                         | 1 file         | `Badge`                                                         |
| `join`, `join-vertical`                         | 1 file         | flex layout                                                     |
| `bg-base-*`, `text-base-content`                | ~20 files      | shadcn CSS variables (`bg-background`, `text-foreground`, etc.) |

### Current theme system

DaisyUI themes defined in `globals.css` with `@plugin "daisyui/theme"` blocks — custom light/dark color palettes using `--color-*` variables. shadcn uses its own CSS variable system (`--background`, `--foreground`, `--primary`, etc.) with OKLCH values and a `.dark` class selector.

---

## Step 1: Install shadcn/ui and dependencies

### 1a. Remove DaisyUI

```bash
cd desktop
pnpm remove daisyui
```

Remove from `globals.css`:

- `@plugin "daisyui" { ... }`
- Both `@plugin "daisyui/theme" { ... }` blocks

### 1b. Install Tailwind v4 Vite plugin

The project currently uses `@tailwindcss/postcss`. shadcn recommends `@tailwindcss/vite` for Vite projects:

```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm remove @tailwindcss/postcss autoprefixer
```

Update `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite"
// ...
plugins: [react(), tailwindcss(), svgr({...})],
```

Remove `postcss.config.js` (no longer needed with the Vite plugin).

### 1c. Initialize shadcn

```bash
pnpm dlx shadcn@latest init
```

This creates `components.json` and sets up the CSS variable theme in `globals.css`. Configure:

- Style: Default
- Base color: Neutral (matches current dark base)
- CSS variables: Yes
- Path alias: `~` (matching existing `~/` alias)

### 1d. Update `tailwind.config.js`

Remove the file — Tailwind v4 with shadcn doesn't need it. The `@config` directive in `globals.css` will be removed too. shadcn's `init` sets up the theme inline in CSS using `@theme`.

### 1e. Update path alias

`components.json` needs to know about the `~/` alias:

```json
{
	"aliases": {
		"components": "~/components",
		"utils": "~/lib/utils",
		"ui": "~/components/ui",
		"hooks": "~/hooks"
	}
}
```

### 1f. Replace `cx()` with `cn()`

shadcn uses `cn()` (from `clsx` + `tailwind-merge`). The current `cx()` in `lib/utils.ts` is a simple `filter(Boolean).join(' ')`. Replace it:

```bash
pnpm add clsx tailwind-merge
```

Add to `lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
```

Replace all `cx(` calls with `cn(` across the codebase. Remove the old `cx` function.

---

## Step 2: Set up globals.css with shadcn theme

Replace the DaisyUI theme blocks with shadcn's CSS variable system. Keep the existing custom styles (font-family, RTL, print media).

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

@theme inline {
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-popover: var(--popover);
	--color-popover-foreground: var(--popover-foreground);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-destructive-foreground: var(--destructive-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);
	--radius: 0.625rem;
}

:root {
	/* shadcn default neutral theme values */
	--background: oklch(1 0 0);
	--foreground: oklch(0.145 0 0);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.145 0 0);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.145 0 0);
	--primary: oklch(0.205 0 0);
	--primary-foreground: oklch(0.985 0 0);
	--secondary: oklch(0.97 0 0);
	--secondary-foreground: oklch(0.205 0 0);
	--muted: oklch(0.97 0 0);
	--muted-foreground: oklch(0.556 0 0);
	--accent: oklch(0.97 0 0);
	--accent-foreground: oklch(0.205 0 0);
	--destructive: oklch(0.577 0.245 27.325);
	--destructive-foreground: oklch(0.577 0.245 27.325);
	--border: oklch(0.922 0 0);
	--input: oklch(0.922 0 0);
	--ring: oklch(0.708 0 0);
}

.dark {
	--background: oklch(0.145 0 0);
	--foreground: oklch(0.985 0 0);
	--card: oklch(0.145 0 0);
	--card-foreground: oklch(0.985 0 0);
	--popover: oklch(0.145 0 0);
	--popover-foreground: oklch(0.985 0 0);
	--primary: oklch(0.985 0 0);
	--primary-foreground: oklch(0.205 0 0);
	--secondary: oklch(0.269 0 0);
	--secondary-foreground: oklch(0.985 0 0);
	--muted: oklch(0.269 0 0);
	--muted-foreground: oklch(0.708 0 0);
	--accent: oklch(0.269 0 0);
	--accent-foreground: oklch(0.985 0 0);
	--destructive: oklch(0.396 0.141 25.723);
	--destructive-foreground: oklch(0.637 0.237 25.331);
	--border: oklch(0.269 0 0);
	--input: oklch(0.269 0 0);
	--ring: oklch(0.439 0 0);
}

@layer base {
	html {
		font-family: 'Proxima Nova', system-ui, sans-serif;
	}
	body {
		@apply bg-background text-foreground;
	}
}

/* Keep existing RTL and print styles */
```

### Theme switching

Currently uses `data-theme="dark"` on `<html>`. Change to adding/removing `.dark` class on `<html>`, which is the shadcn convention. Update `PreferenceProvider` accordingly.

---

## Step 3: Install shadcn components

Install all needed components:

```bash
pnpm dlx shadcn@latest add button dialog dropdown-menu collapsible label input textarea switch progress tabs tooltip sonner spinner badge separator
```

This creates files in `src/components/ui/`.

---

## Step 4: Migrate DaisyUI color classes

Global find-and-replace for DaisyUI semantic color classes:

| DaisyUI class             | shadcn/Tailwind replacement                    |
| ------------------------- | ---------------------------------------------- |
| `bg-base-100`             | `bg-background`                                |
| `bg-base-200`             | `bg-muted`                                     |
| `bg-base-300`             | `bg-accent`                                    |
| `text-base-content`       | `text-foreground`                              |
| `bg-primary`              | `bg-primary` (same name, different value)      |
| `text-primary`            | `text-primary`                                 |
| `bg-error` / `text-error` | `bg-destructive` / `text-destructive`          |
| `stroke-base-content`     | `stroke-foreground`                            |
| `link link-primary`       | `text-primary underline hover:text-primary/80` |

---

## Step 5: Migrate components file by file

### 5a. Buttons — all files

Replace DaisyUI button classes with shadcn `<Button>` component:

| DaisyUI             | shadcn                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `btn btn-primary`   | `<Button>` (default variant)                                                  |
| `btn btn-secondary` | `<Button variant="secondary">`                                                |
| `btn btn-ghost`     | `<Button variant="ghost">`                                                    |
| `btn btn-outline`   | `<Button variant="outline">`                                                  |
| `btn btn-success`   | `<Button variant="secondary" className="bg-green-600 ...">` or custom variant |
| `btn btn-xs`        | `<Button size="sm">`                                                          |
| `btn btn-sm`        | `<Button size="sm">`                                                          |
| `btn btn-md`        | `<Button size="default">`                                                     |
| `btn btn-square`    | `<Button variant="ghost" size="icon">`                                        |

**Files:** Every component — AppMenu, Params, TextArea, ErrorModal, SettingsPage, HomePage, BatchPage, etc.

### 5b. Modals → Dialog

Replace all DaisyUI modals (`modal modal-open modal-box modal-action`) with shadcn `<Dialog>`.

**SettingsModal.tsx:**

```tsx
<Dialog open={visible} onOpenChange={setVisible}>
	<DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
		<SettingsPage setVisible={setVisible} />
	</DialogContent>
</Dialog>
```

**ErrorModal.tsx:**

```tsx
<Dialog open={state?.open} onOpenChange={(open) => setState({ ...state, open })}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{t('common.error-title')}</DialogTitle>
			<DialogDescription>{t('common.modal-error-body')}</DialogDescription>
		</DialogHeader>
		{/* ... content ... */}
	</DialogContent>
</Dialog>
```

**UpdaterProgress.tsx:** Same pattern with `<Dialog>`.

**DropModal.tsx:** Use `<Dialog>` with custom backdrop blur styling.

**Files:** `SettingsModal.tsx`, `ErrorModal.tsx`, `UpdaterProgress.tsx`, `DropModal.tsx`

### 5c. Dropdowns → DropdownMenu

**AppMenu.tsx:** Replace DaisyUI `dropdown dropdown-content menu` with shadcn `<DropdownMenu>`:

```tsx
<DropdownMenu open={open} onOpenChange={setOpen}>
	<DropdownMenuTrigger asChild>
		<Button variant="ghost" size="icon">
			<EllipsisIcon />
		</Button>
	</DropdownMenuTrigger>
	<DropdownMenuContent>
		<DropdownMenuItem onSelect={() => onClickSettings()}>{t('common.settings')}</DropdownMenuItem>
		<DropdownMenuItem onSelect={() => navigate(-1)}>{t('common.back')}</DropdownMenuItem>
		{availableUpdate && <DropdownMenuItem onSelect={() => updateApp()}>{t('common.update-version')}</DropdownMenuItem>}
	</DropdownMenuContent>
</DropdownMenu>
```

**TextArea.tsx** (format select dropdown and replace-with dropdown): Similar pattern.

**Files:** `AppMenu.tsx`, `TextArea.tsx`

### 5d. Collapse → Collapsible

**Params.tsx** and **AdvancedTranscribe.tsx:** Replace DaisyUI `collapse collapse-open collapse-content` with shadcn `<Collapsible>`:

```tsx
<Collapsible open={open} onOpenChange={setOpen}>
	<CollapsibleTrigger asChild>
		<button className="mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer">
			{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
			{t('common.more-options')}
		</button>
	</CollapsibleTrigger>
	<CollapsibleContent>{/* ... form fields ... */}</CollapsibleContent>
</Collapsible>
```

**Files:** `Params.tsx`, `AdvancedTranscribe.tsx`, `BatchPanel.tsx`

### 5e. Form controls — Label, Input, Textarea, Select

Replace DaisyUI form patterns:

**Before (DaisyUI):**

```tsx
<label className="form-control w-full">
	<div className="label">
		<span className="label-text">Label</span>
	</div>
	<input className="input input-bordered" />
</label>
```

**After (shadcn):**

```tsx
<div className="space-y-2">
	<Label>Label</Label>
	<Input />
</div>
```

For `<select>` elements: use shadcn's `<select>` with Tailwind styling (the app uses native selects with `<option>` + `<optgroup>`, which don't work with Radix Select). Apply consistent border/focus styling via a utility class or inline.

For `<textarea>`: use shadcn's `<Textarea>` component.

**Files:** `Params.tsx`, `LanguageInput.tsx`, `FormatSelect.tsx`, `FormatMultiSelect.tsx`, `AudioDeviceInput.tsx`, `SettingsPage.tsx`, `HomePage.tsx`

### 5f. Toggles → Switch

Replace all DaisyUI toggles with shadcn `<Switch>`:

**Before:**

```tsx
<input type="checkbox" className="toggle toggle-primary" checked={value} onChange={handler} />
```

**After:**

```tsx
<Switch checked={value} onCheckedChange={handler} />
```

**Files:** `Params.tsx`, `SettingsPage.tsx`, `HomePage.tsx`

### 5g. Tabs → Tabs

**HomePage.tsx:** Replace DaisyUI tabs with shadcn `<Tabs>`:

```tsx
<Tabs value={String(vm.preference.homeTabIndex)} onValueChange={(v) => vm.preference.setHomeTabIndex(Number(v))}>
	<TabsList>
		<TabsTrigger value="0">
			<MicrophoneIcon className="w-[18px] h-[18px]" />
		</TabsTrigger>
		<TabsTrigger value="1">
			<FileIcon className="w-[18px] h-[18px]" />
		</TabsTrigger>
		<TabsTrigger value="2">
			<LinkIcon className="w-[18px] h-[18px]" />
		</TabsTrigger>
	</TabsList>
	<TabsContent value="0">{/* Record tab */}</TabsContent>
	<TabsContent value="1">{/* File tab */}</TabsContent>
	<TabsContent value="2">{/* URL tab */}</TabsContent>
</Tabs>
```

Also the transcript/summary tab switcher.

**Files:** `HomePage.tsx`

### 5h. Tooltips → Tooltip

Replace DaisyUI tooltip pattern with shadcn `<Tooltip>`:

**Before:**

```tsx
<div className="tooltip tooltip-bottom" data-tip={info}>
	<button className="btn btn-square btn-md">...</button>
</div>
```

**After:**

```tsx
<TooltipProvider>
	<Tooltip>
		<TooltipTrigger asChild>
			<Button variant="ghost" size="icon">
				...
			</Button>
		</TooltipTrigger>
		<TooltipContent side="bottom">{info}</TooltipContent>
	</Tooltip>
</TooltipProvider>
```

Add a single `<TooltipProvider>` in `App.tsx` to wrap the entire app.

**Files:** `TextArea.tsx`, `InfoTooltip.tsx`, and anywhere tooltips are used

### 5i. Toast → Sonner

Replace `react-hot-toast` and the custom `Toast.tsx` component with shadcn's Sonner integration:

```bash
pnpm remove react-hot-toast
pnpm dlx shadcn@latest add sonner
```

**App.tsx:** Add `<Toaster />` from sonner.

Replace all `toast()` calls:

- `toast('message')` → `toast('message')` (from sonner)
- `toast.promise(...)` → `toast.promise(...)` (sonner has the same API)
- Custom toast provider (`ToastProvider`) with progress → use sonner's `toast.loading()` with description updates

**Files:** `App.tsx`, `Toast.tsx` (delete), `providers/Toast.tsx` (simplify or delete), `TextArea.tsx`, `Params.tsx`, all files importing `react-hot-toast`

### 5j. Progress bars

Replace DaisyUI `progress progress-primary` with shadcn `<Progress>`:

**Before:**

```tsx
<progress className="progress progress-primary w-56" value={progress} max="100" />
```

**After:**

```tsx
<Progress value={progress} className="w-56" />
```

**Files:** `Toast.tsx`, `UpdaterProgress.tsx`, `ProgressPanel.tsx`, `BatchPanel.tsx`

### 5k. Loading spinners

Replace DaisyUI `loading loading-spinner` with shadcn `<Spinner>`:

**Before:**

```tsx
<span className="loading loading-spinner"></span>
```

**After:**

```tsx
<Spinner />
```

Or use a simple SVG spinner with Tailwind `animate-spin`.

**Files:** `HomePage.tsx`, `ProgressPanel.tsx`, `BatchQueue.tsx`

### 5l. Swap component (theme toggle, audio player)

DaisyUI's `swap` has no shadcn equivalent. Replace with a simple conditional render or shadcn `<Toggle>`:

**\_ThemeToggle.tsx:** Replace swap with a button that toggles between sun/moon icons.

**AudioPlayer.tsx:** Replace swap with conditional play/pause icon rendering.

**Files:** `_ThemeToggle.tsx`, `AudioPlayer.tsx`

---

## Step 6: Update theme switching mechanism

### Change from `data-theme` to `.dark` class

**PreferenceProvider:** Update theme application logic:

```ts
// Before
document.documentElement.setAttribute('data-theme', theme)

// After
if (theme === 'dark') {
	document.documentElement.classList.add('dark')
} else {
	document.documentElement.classList.remove('dark')
}
```

Remove `darkMode: ['class', '[data-theme="dark"]']` from `tailwind.config.js` (file will be deleted).

Update print styles in `globals.css` to use `.dark` instead of `[data-theme='dark']`.

---

## Step 7: Clean up

### 7a. Remove DaisyUI

- `pnpm remove daisyui`
- Delete `tailwind.config.js`
- Delete `postcss.config.js`
- Remove `@config "../tailwind.config.js"` from `globals.css`

### 7b. Remove react-hot-toast

- `pnpm remove react-hot-toast`
- Delete `src/components/Toast.tsx`
- Simplify or remove `src/providers/Toast.tsx` (if progress toast is handled by sonner)

### 7c. Verify no DaisyUI classes remain

```bash
grep -r "btn-primary\|btn-ghost\|btn-outline\|modal-open\|modal-box\|form-control\|label-text\|input-bordered\|select-bordered\|textarea-bordered\|toggle-primary\|collapse-open\|collapse-content\|dropdown-content\|tab-active\|tooltip-bottom\|bg-base-\|text-base-content\|loading-spinner\|swap-" desktop/src/
```

Should return zero matches.

---

## Migration order (recommended)

Execute in this order to keep the app functional between steps:

1. **Step 1** — Install shadcn, remove DaisyUI, set up theme CSS variables
2. **Step 2** — Set up `globals.css` with shadcn theme
3. **Step 6** — Update theme switching to `.dark` class
4. **Step 4** — Global color class replacements
5. **Step 3** — Install all shadcn components
6. **Step 1f** — Replace `cx()` with `cn()`
7. **Step 5a** — Buttons (highest frequency, fastest visual improvement)
8. **Step 5e** — Form controls (Label, Input, Textarea, Select)
9. **Step 5f** — Toggles → Switch
10. **Step 5b** — Modals → Dialog
11. **Step 5c** — Dropdowns → DropdownMenu
12. **Step 5d** — Collapse → Collapsible
13. **Step 5g** — Tabs
14. **Step 5h** — Tooltips
15. **Step 5j** — Progress bars
16. **Step 5k** — Loading spinners
17. **Step 5i** — Toast → Sonner (replace react-hot-toast)
18. **Step 5l** — Swap components
19. **Step 7** — Final cleanup and verification

---

## Files affected

### New files (created by shadcn CLI)

- `desktop/components.json`
- `desktop/src/components/ui/button.tsx`
- `desktop/src/components/ui/dialog.tsx`
- `desktop/src/components/ui/dropdown-menu.tsx`
- `desktop/src/components/ui/collapsible.tsx`
- `desktop/src/components/ui/label.tsx`
- `desktop/src/components/ui/input.tsx`
- `desktop/src/components/ui/textarea.tsx`
- `desktop/src/components/ui/switch.tsx`
- `desktop/src/components/ui/progress.tsx`
- `desktop/src/components/ui/tabs.tsx`
- `desktop/src/components/ui/tooltip.tsx`
- `desktop/src/components/ui/sonner.tsx`
- `desktop/src/components/ui/spinner.tsx`
- `desktop/src/components/ui/badge.tsx`
- `desktop/src/components/ui/separator.tsx`

### Modified files

- `desktop/vite.config.ts` — add `@tailwindcss/vite` plugin
- `desktop/src/globals.css` — replace DaisyUI theme with shadcn CSS variables
- `desktop/src/lib/utils.ts` — replace `cx()` with `cn()`
- `desktop/src/App.tsx` — add `<TooltipProvider>` and `<Toaster />`
- `desktop/src/components/Layout.tsx` — remove Toast import
- `desktop/src/components/AppMenu.tsx` — DropdownMenu
- `desktop/src/components/Params.tsx` — Collapsible, Switch, Label, Input, Textarea, Button
- `desktop/src/components/TextArea.tsx` — Button, Tooltip, Textarea, DropdownMenu
- `desktop/src/components/SettingsModal.tsx` — Dialog
- `desktop/src/components/DropModal.tsx` — Dialog
- `desktop/src/components/ErrorModal.tsx` — Dialog, Button
- `desktop/src/components/UpdaterProgress.tsx` — Dialog, Progress
- `desktop/src/components/InfoTooltip.tsx` — Tooltip
- `desktop/src/components/LanguageInput.tsx` — Label, native select styling
- `desktop/src/components/FormatSelect.tsx` — Label, native select styling
- `desktop/src/components/FormatMultiSelect.tsx` — Button, Label
- `desktop/src/components/AudioDeviceInput.tsx` — Label, native select styling
- `desktop/src/components/AdvancedTranscribe.tsx` — Collapsible, Switch, Button
- `desktop/src/components/_ThemeToggle.tsx` — Button/Toggle
- `desktop/src/pages/home/Page.tsx` — Tabs, Button, Switch, Input
- `desktop/src/pages/home/AudioInput.tsx` — Button
- `desktop/src/pages/home/AudioPlayer.tsx` — conditional render (replace swap)
- `desktop/src/pages/home/ProgressPanel.tsx` — Spinner, Button
- `desktop/src/pages/settings/Page.tsx` — Button, Label, Switch, Input, native select
- `desktop/src/pages/batch/Page.tsx` — Button
- `desktop/src/pages/batch/BatchPanel.tsx` — Collapsible, Progress, Button
- `desktop/src/pages/batch/BatchQueue.tsx` — Spinner
- `desktop/src/pages/setup/Page.tsx` — Progress, Button
- `desktop/src/providers/Preference.tsx` — theme switching (`.dark` class)
- `desktop/src/providers/Toast.tsx` — simplify or remove
- `desktop/package.json` — dependency changes

### Deleted files

- `desktop/tailwind.config.js`
- `desktop/postcss.config.js`
- `desktop/src/components/Toast.tsx`

### Dependency changes

**Add:**

- `clsx`
- `tailwind-merge`
- `sonner`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-collapsible`
- `@radix-ui/react-label`
- `@radix-ui/react-switch`
- `@radix-ui/react-progress`
- `@radix-ui/react-tabs`
- `@radix-ui/react-tooltip`
- `@radix-ui/react-separator`
- (Radix deps are auto-installed by `shadcn add`)

**Remove:**

- `daisyui`
- `react-hot-toast`
- `@tailwindcss/postcss`
- `autoprefixer`
