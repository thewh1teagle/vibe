# Plan: Post-shadcn migration UI fixes

## Context

The DaisyUI → shadcn migration is structurally complete (no DaisyUI classes remain, all components replaced). However several visual/UX issues need fixing:

1. Tabs stuck to the left instead of centered
2. 3-dot menu only opens on click, not hover; menu has ugly border
3. Settings "modal" is a small Dialog box instead of a full-screen glass overlay
4. Select elements and buttons look off (default neutral theme is too muted)
5. Colors are wrong — need Google Material Design theme

---

## Issue 1: Tabs not centered

**Root cause:** `TabsList` is `inline-flex` (set in `ui/tabs.tsx`). The `m-auto` class on it centers a block-level element, but `inline-flex` elements don't respond to `margin: auto` for horizontal centering unless the parent is a flex container.

**Fix in `pages/home/Page.tsx`:**

The `<Tabs>` root component (a plain `<div>`) needs to act as a flex column with centered items:

```tsx
<Tabs
  value={String(vm.preference.homeTabIndex)}
  onValueChange={...}
  className="flex flex-col items-center"
>
  <TabsList className="mt-5">
```

Remove `m-auto` from `TabsList` since the parent flex handles centering.

Same fix for the transcript/summary tabs further down:
```tsx
<Tabs ... className="flex flex-col items-center">
  <TabsList>
```

**File:** `desktop/src/pages/home/Page.tsx` (lines 40-51, 116-121)

---

## Issue 2: 3-dot menu — hover behavior + border

### 2a. Hover-to-open

**Root cause:** Radix `DropdownMenu` is click-only by default. The old DaisyUI version used `onMouseEnter`/`onMouseLeave` handlers.

**Fix:** Use controlled `open` state with mouse events on the wrapper div, same pattern as the original:

```tsx
export default function AppMenu({ ... }: AppMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="absolute left-0 top-0"
      dir="ltr"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <EllipsisIcon />
            {availableUpdate && <IndicatorIcon ... />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          ...
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

Key: pass `open`/`onOpenChange` to `DropdownMenu` for controlled mode. Mouse events on the wrapper and content keep it open while hovering.

### 2b. Remove ugly border

**Root cause:** `DropdownMenuContent` in `ui/dropdown-menu.tsx` has a `border` class in its default styling (line 68).

**Fix:** Remove the `border` class from `DropdownMenuContent` default styles, or override it in AppMenu:

Option A — Remove from component defaults (affects all dropdown menus):
```tsx
// ui/dropdown-menu.tsx line 68
"z-50 ... rounded-md border bg-popover ..."
//                    ^^^^^^ remove this
```

Option B — Override in AppMenu only:
```tsx
<DropdownMenuContent align="start" className="border-none shadow-lg">
```

**Recommendation:** Option B — keep default border for other dropdown menus, remove it only for the app menu.

**File:** `desktop/src/components/AppMenu.tsx`

---

## Issue 3: Settings — full-screen glass overlay instead of Dialog

**Root cause:** Settings was converted from a full-screen DaisyUI modal (with `backdrop-blur-3xl !bg-base-100`) to a standard shadcn `Dialog` with `max-w-md`. The original design was a full-screen page with a glass/blur background, not a centered dialog box.

**Fix:** Don't use `Dialog` at all. Render the settings as a full-screen overlay div (like the original), with backdrop blur and proper scrolling:

```tsx
// SettingsModal.tsx
export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-xl">
      <SettingsPage setVisible={setVisible} />
    </div>
  )
}
```

This gives:
- Full-screen coverage (not a tiny modal box)
- Glass blur effect via `backdrop-blur-xl`
- Semi-transparent background via `bg-background/80`
- Scrollable content
- No dialog chrome (no X button, no border, no shadow)

Remove the `Dialog` and `DialogContent` imports.

**File:** `desktop/src/components/SettingsModal.tsx`

---

## Issue 4: Apply Google Material Design theme

**Root cause:** Currently using shadcn's default neutral theme — all grays, no color personality. The primary color is near-black (`oklch(0.205 0 0)`) which makes buttons and interactive elements look flat.

### 4a. Install the material-design theme

```bash
cd desktop
pnpm dlx shadcn@latest add "https://www.shadcn.io/r/material-design.json?token=0a73fe0685f0efbb98bb411cbd55661f6b92b1a35bd8ab2d965f6807102cc9d4"
```

This is a `registry:style` type package. It will update `globals.css` with the material design CSS variables. **Verify after running** that it updates the `:root` and `.dark` blocks in `globals.css`.

### 4b. Verify/manually apply theme variables

If the CLI only partially updates, manually replace the `:root` and `.dark` blocks in `globals.css` with the material theme values:

**Light theme (`:root`):**
```css
:root {
  --radius: 1rem;
  --background: oklch(0.98 0.01 334.35);
  --foreground: oklch(0.22 0 0);
  --card: oklch(0.96 0.01 335.69);
  --card-foreground: oklch(0.14 0 0);
  --popover: oklch(0.95 0.01 316.67);
  --popover-foreground: oklch(0.40 0.04 309.35);
  --primary: oklch(0.51 0.21 286.50);
  --primary-foreground: oklch(1.00 0 0);
  --secondary: oklch(0.49 0.04 300.23);
  --secondary-foreground: oklch(1.00 0 0);
  --muted: oklch(0.96 0.01 335.69);
  --muted-foreground: oklch(0.14 0 0);
  --accent: oklch(0.92 0.04 303.47);
  --accent-foreground: oklch(0.14 0 0);
  --destructive: oklch(0.57 0.23 29.21);
  --destructive-foreground: oklch(1.00 0 0);
  --border: oklch(0.83 0.02 308.26);
  --input: oklch(0.57 0.02 309.68);
  --ring: oklch(0.50 0.13 293.77);
}
```

**Dark theme (`.dark`):**
```css
.dark {
  --background: oklch(0.15 0.01 317.69);
  --foreground: oklch(0.95 0.01 321.50);
  --card: oklch(0.22 0.02 322.13);
  --card-foreground: oklch(0.95 0.01 321.50);
  --popover: oklch(0.22 0.02 322.13);
  --popover-foreground: oklch(0.95 0.01 321.50);
  --primary: oklch(0.60 0.22 279.81);
  --primary-foreground: oklch(0.98 0.01 321.51);
  --secondary: oklch(0.45 0.03 294.79);
  --secondary-foreground: oklch(0.95 0.01 321.50);
  --muted: oklch(0.22 0.01 319.50);
  --muted-foreground: oklch(0.70 0.01 320.70);
  --accent: oklch(0.35 0.06 299.57);
  --accent-foreground: oklch(0.95 0.01 321.50);
  --destructive: oklch(0.57 0.23 29.21);
  --destructive-foreground: oklch(1.00 0 0);
  --border: oklch(0.40 0.04 309.35);
  --input: oklch(0.40 0.04 309.35);
  --ring: oklch(0.50 0.15 294.97);
}
```

Key color changes from default neutral:
- **Primary** goes from near-black to **purple** (`oklch(0.51 0.21 286.50)`) — buttons become visibly colored
- **Background** gains a subtle warm tint instead of pure white/black
- **Cards/popovers** have distinct elevated surfaces
- **Border/input** get subtle purple-tinted grays
- **Radius** increases from `0.625rem` to `1rem` for rounder, softer feel

### 4c. Add theme font and shadow variables

The material theme also defines font and shadow overrides. Add to the `@theme inline` block:

```css
@theme inline {
  /* ... existing color mappings ... */
  --font-sans: Roboto, sans-serif;
  --font-serif: Merriweather, serif;
  --radius: 1rem;
}
```

Update the base font in `@layer base`:
```css
@layer base {
  html {
    font-family: var(--font-sans), system-ui, sans-serif;
  }
}
```

Since the project already has `@fontsource/roboto` as a dependency, import it in `globals.css` or `main.tsx`:
```ts
import '@fontsource/roboto'
```

### 4d. Add shadow definitions from the material theme

Add the material shadow system to the `@theme inline` block:

```css
@theme inline {
  /* ... colors ... */
  --shadow-2xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10);
  --shadow: 0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10);
  --shadow-md: 0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 2px 4px -2px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 4px 6px -2px hsl(0 0% 0% / 0.10);
}
```

**File:** `desktop/src/globals.css`

---

## Issue 5: Select elements and buttons looking weird

### 5a. Create a reusable styled select component

Native `<select>` elements are used throughout (LanguageInput, FormatSelect, AudioDeviceInput, SettingsPage, Params). They currently use inconsistent inline classes like `"w-full rounded-md border border-input bg-background px-3 py-2 text-sm"`.

**Create `desktop/src/components/ui/native-select.tsx`:**

```tsx
import * as React from "react"
import { cn } from "~/lib/utils"

const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
))
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
```

Then replace all inline-styled `<select>` elements with `<NativeSelect>`:
- `pages/settings/Page.tsx` — language select, theme select, model select
- `components/LanguageInput.tsx`
- `components/FormatSelect.tsx`
- `components/AudioDeviceInput.tsx`
- `components/Params.tsx` — platform select, sampling strategy select
- `components/TextArea.tsx` — format select

### 5b. Button improvements

With the material theme applied (Issue 4), buttons will look much better since primary will be purple instead of near-black. No structural button changes needed — just the theme swap fixes the "weird" look.

If secondary buttons still look too flat in settings, consider using `variant="outline"` instead of `variant="secondary"` for the action buttons (models folder, report issue, etc.) to give them visible borders.

---

## Execution order

1. **Issue 4** — Apply Material Design theme (biggest visual impact, fixes colors everywhere)
2. **Issue 5a** — Create `NativeSelect` component and use it everywhere
3. **Issue 3** — Replace Settings Dialog with full-screen glass overlay
4. **Issue 1** — Center tabs with flex parent
5. **Issue 2** — AppMenu hover behavior + remove border

---

## Files affected

| File | Changes |
|-|-|
| `src/globals.css` | Replace color variables with material theme, add shadows/fonts |
| `src/components/SettingsModal.tsx` | Replace Dialog with full-screen overlay div |
| `src/components/AppMenu.tsx` | Add hover open/close, remove menu border |
| `src/pages/home/Page.tsx` | Add `flex flex-col items-center` to Tabs |
| `src/components/ui/native-select.tsx` | **New** — reusable styled native select |
| `src/pages/settings/Page.tsx` | Use NativeSelect |
| `src/components/LanguageInput.tsx` | Use NativeSelect |
| `src/components/FormatSelect.tsx` | Use NativeSelect |
| `src/components/AudioDeviceInput.tsx` | Use NativeSelect |
| `src/components/Params.tsx` | Use NativeSelect |
| `src/components/TextArea.tsx` | Use NativeSelect |

---

## Verification

After all fixes:
1. Tabs centered on home page (record/file/URL icons)
2. 3-dot menu opens on hover, no visible border on the dropdown
3. Settings is a full-screen glass-blur overlay, scrollable, not a tiny dialog box
4. All colors are Material Design purple theme — primary buttons are purple, backgrounds have subtle warmth
5. Select elements look consistent with inputs (same height, border, focus ring)
6. Dark mode still works correctly with material theme colors
