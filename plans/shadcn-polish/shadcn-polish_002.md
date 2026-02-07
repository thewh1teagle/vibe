# Plan: UI polish round 2

## Issue 1 (Critical): 3-dot menu hover flickering — can't access settings

**Root cause:** Radix `DropdownMenuContent` renders in a **portal** (outside the DOM tree of the wrapper div). When the menu opens, the mouse technically leaves the wrapper div → `onMouseLeave` fires → `setOpen(false)` → menu closes → mouse is back on the trigger → `onMouseEnter` → `setOpen(true)` → infinite flicker loop.

**Fix:** Stop using Radix `DropdownMenu` for AppMenu. Replace with a simple positioned div that stays in the DOM tree (exactly how the original DaisyUI version worked). Hover works naturally when the menu content is a child of the hover wrapper.

```tsx
export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)

	return (
		<div className="absolute left-0 top-0" dir="ltr" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
			<Button variant="ghost" size="icon" className="relative h-10 w-10" onMouseDown={() => setOpen(!open)}>
				<EllipsisIcon className="h-5 w-5" />
				{availableUpdate && <IndicatorIcon className="w-2 h-2 absolute -top-0.5 left-4" />}
			</Button>

			{open && (
				<div className="absolute top-full left-0 z-50 min-w-[12rem] rounded-lg bg-popover p-1 shadow-lg">
					<button
						onMouseDown={onClickSettings}
						className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
						{t('common.settings')}
					</button>
					<button
						onMouseDown={() => navigate(-1)}
						className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
						{t('common.back')}
					</button>
					{availableUpdate && (
						<button
							onMouseDown={updateApp}
							className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
							{t('common.update-version')}
						</button>
					)}
				</div>
			)}
		</div>
	)
}
```

This removes the Radix DropdownMenu imports entirely for AppMenu. The menu div is a **direct child** of the hover wrapper, so `onMouseEnter`/`onMouseLeave` covers both trigger and content seamlessly.

Also note: the button is now `h-10 w-10` (fixing issue 2 below) and the icon is `h-5 w-5`.

**File:** `desktop/src/components/AppMenu.tsx`

---

## Issue 2: 3-dot button slightly too small

**Root cause:** `size="icon"` in the button component is `h-9 w-9`. The trigger area is small and easy to miss.

**Fix:** Already handled in Issue 1 above — the button gets `className="relative h-10 w-10"` which overrides the default `h-9 w-9` from `size="icon"`. The SVG icon inside also bumps to `h-5 w-5` for better visibility.

No changes to the base button component needed — this is a one-off override.

---

## Issue 3: Buttons should have cursor pointer

**Root cause:** shadcn's default `buttonVariants` base class doesn't include `cursor-pointer`. Browsers default `<button>` to `cursor: default` unless styled otherwise.

**Fix:** Add `cursor-pointer` to the base class string in `ui/button.tsx`:

```diff
 const buttonVariants = cva(
-  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
+  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

One word added — affects all buttons globally.

**File:** `desktop/src/components/ui/button.tsx`

---

## Issue 4: Select elements need slightly more rounded corners

**Root cause:** `NativeSelect` uses `rounded-md` (0.375rem). With the material theme's `--radius: 1rem`, other components like buttons use `rounded-md` too but the select looks slightly blocky compared to inputs.

**Fix:** Change `rounded-md` to `rounded-lg` in the NativeSelect component for a softer, more consistent look:

```diff
-  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
+  'flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
```

Also adds `cursor-pointer` since selects are interactive elements.

**File:** `desktop/src/components/ui/native-select.tsx`

---

## Execution order

1. **Issue 1** — Fix AppMenu hover (critical — settings is inaccessible)
2. **Issue 3** — Add cursor-pointer to buttons (one-line change)
3. **Issue 4** — Round select corners + cursor-pointer (one-line change)

Issue 2 is solved by Issue 1.

## Files affected

| File                                  | Change                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| `src/components/AppMenu.tsx`          | Replace Radix DropdownMenu with simple div-based hover menu |
| `src/components/ui/button.tsx`        | Add `cursor-pointer` to base class                          |
| `src/components/ui/native-select.tsx` | Change `rounded-md` → `rounded-lg`, add `cursor-pointer`    |
