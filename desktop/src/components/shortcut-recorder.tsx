import { Keyboard, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/style'

export const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

/** Accelerator token → what the key is called on this platform's keyboard. */
const KEY_LABELS: Record<string, string> = {
	CmdOrCtrl: IS_MAC ? '⌘' : 'Ctrl',
	CommandOrControl: IS_MAC ? '⌘' : 'Ctrl',
	Cmd: '⌘',
	Command: '⌘',
	Super: IS_MAC ? '⌘' : 'Win',
	Control: IS_MAC ? '⌃' : 'Ctrl',
	Ctrl: IS_MAC ? '⌃' : 'Ctrl',
	Alt: IS_MAC ? '⌥' : 'Alt',
	Option: '⌥',
	Shift: IS_MAC ? '⇧' : 'Shift',
	Space: IS_MAC ? '␣' : 'Space',
	Enter: IS_MAC ? '⏎' : 'Enter',
	Backspace: IS_MAC ? '⌫' : 'Backspace',
	Tab: IS_MAC ? '⇥' : 'Tab',
	Up: '↑',
	Down: '↓',
	Left: '←',
	Right: '→',
}

/** `CmdOrCtrl+Shift+Space` → `['⌘', '⇧', '␣']` */
export function shortcutKeyLabels(shortcut: string): string[] {
	if (!shortcut) return []
	return shortcut.split('+').map((key) => KEY_LABELS[key] ?? key)
}

/** The printable key of a press, as an accelerator token — null for a bare modifier. */
function mainKeyOf(event: KeyboardEvent): string | null {
	const code = event.code
	if (/^Key[A-Z]$/.test(code)) return code.slice(3)
	if (/^Digit\d$/.test(code)) return code.slice(5)
	if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`
	if (/^F\d{1,2}$/.test(code)) return code
	if (code.startsWith('Arrow')) return code.slice(5)
	if (['Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert'].includes(code)) return code
	if (['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote'].includes(code)) {
		return code
	}
	return null
}

/** The held modifiers, in the order accelerators are written. */
function modifiersOf(event: KeyboardEvent): string[] {
	const parts: string[] = []
	// The primary modifier travels as CmdOrCtrl so one shortcut fits every platform.
	if (IS_MAC ? event.metaKey : event.ctrlKey) parts.push('CmdOrCtrl')
	if (IS_MAC && event.ctrlKey) parts.push('Control')
	if (!IS_MAC && event.metaKey) parts.push('Super')
	if (event.altKey) parts.push('Alt')
	if (event.shiftKey) parts.push('Shift')
	return parts
}

/**
 * Ready-made combos. Some of these — anything on ⌘Space — are swallowed by the system before the
 * app sees the key, so they can only ever be picked from a list, never recorded by pressing them.
 */
const SUGGESTIONS = ['CmdOrCtrl+Shift+Space', 'Alt+Space', 'CmdOrCtrl+Shift+D', 'CmdOrCtrl+Shift+V']

interface ShortcutRecorderProps {
	value: string
	onChange: (shortcut: string) => void
	/** Reset target; the reset button only shows when the value differs from it. */
	defaultValue?: string
	/** Fired while capturing, so the caller can suspend the live global shortcut. */
	onCapturingChange?: (capturing: boolean) => void
	className?: string
}

/**
 * Records a shortcut by pressing it, the way system settings do — no accelerator syntax to learn,
 * and the keys are shown as keycaps for the platform running the app.
 */
export default function ShortcutRecorder({ value, onChange, defaultValue, onCapturingChange, className }: ShortcutRecorderProps) {
	const [capturing, setCapturing] = useState(false)
	// Modifiers held so far, so the control reacts before the combo is complete.
	const [held, setHeld] = useState<string[]>([])

	function stop() {
		setCapturing(false)
		setHeld([])
	}

	useEffect(() => {
		onCapturingChange?.(capturing)
		// Closing Settings or changing pages can unmount an active recorder before
		// stop() runs. Always release capture so the global shortcut is registered again.
		return () => onCapturingChange?.(false)
	}, [capturing, onCapturingChange])

	useEffect(() => {
		if (!capturing) return

		function onKeyDown(event: KeyboardEvent) {
			event.preventDefault()
			event.stopPropagation()
			if (event.code === 'Escape') {
				stop()
				return
			}
			const modifiers = modifiersOf(event)
			const key = mainKeyOf(event)
			if (!key) {
				setHeld(modifiers)
				return
			}
			// A bare key would fire while typing anywhere on the system; require a modifier.
			if (modifiers.length === 0) {
				setHeld([key])
				return
			}
			onChange([...modifiers, key].join('+'))
			stop()
		}

		function onKeyUp(event: KeyboardEvent) {
			event.preventDefault()
			setHeld(modifiersOf(event))
		}

		window.addEventListener('keydown', onKeyDown, true)
		window.addEventListener('keyup', onKeyUp, true)
		return () => {
			window.removeEventListener('keydown', onKeyDown, true)
			window.removeEventListener('keyup', onKeyUp, true)
		}
	}, [capturing, onChange])

	const labels = capturing ? shortcutKeyLabels(held.join('+')) : shortcutKeyLabels(value)
	const canReset = Boolean(defaultValue) && value !== defaultValue

	function pick(shortcut: string) {
		onChange(shortcut)
		stop()
	}

	return (
		<Popover open={capturing} onOpenChange={(open) => (open ? setCapturing(true) : stop())}>
			<div className={cn('flex items-center gap-1.5', className)}>
				<PopoverTrigger asChild>
					<button
						type="button"
						// Key combinations are read left-to-right in every locale.
						dir="ltr"
						aria-label={m.changeShortcut()}
						className={cn(
							// Fixed width: the box must not jump around while keys are being pressed.
							'flex h-9 w-[188px] cursor-pointer items-center justify-center gap-1 rounded-lg border px-3 transition-colors duration-150',
							capturing ? 'border-ring/70 bg-muted/40 ring-2 ring-ring/25' : 'border-border/70 hover:bg-muted/50',
						)}>
						{labels.length > 0 ? (
							labels.map((key, index) => (
								<kbd
									key={`${key}-${index}`}
									className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-background px-1.5 font-mono text-[11px] font-medium text-foreground">
									{key}
								</kbd>
							))
						) : (
							<span className="text-[13px] text-muted-foreground">{capturing ? m.pressShortcutKeys() : m.globalHotkeyShortcut()}</span>
						)}
					</button>
				</PopoverTrigger>

				{canReset && !capturing && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="iconSm"
								aria-label={m.resetToDefault()}
								onClick={() => onChange(defaultValue!)}
								className="rounded-full text-muted-foreground hover:text-foreground">
								<RotateCcw className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{m.resetToDefault()}</TooltipContent>
					</Tooltip>
				)}
			</div>

			<PopoverContent align="end" className="w-64 rounded-2xl p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
				<p className="flex items-center gap-2 text-[13px] text-foreground">
					<Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
					{m.pressShortcutKeys()}
				</p>
				<p className="mt-1 text-[11px] text-muted-foreground">{m.shortcutNeedsModifier()}</p>

				<p className="mt-3 mb-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.popular()}</p>
				<div dir="ltr" className="flex flex-wrap gap-1.5">
					{SUGGESTIONS.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => pick(suggestion)}
							className={cn(
								'flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 transition-colors duration-150',
								suggestion === value ? 'border-primary/60 bg-primary/10' : 'border-border/70 hover:bg-muted/60',
							)}>
							{shortcutKeyLabels(suggestion).map((key, index) => (
								<kbd key={`${key}-${index}`} className="font-mono text-[11px] font-medium text-foreground">
									{key}
								</kbd>
							))}
						</button>
					))}
				</div>

				{canReset && (
					<button
						type="button"
						onClick={() => pick(defaultValue!)}
						className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground">
						<RotateCcw className="h-3.5 w-3.5" />
						{m.resetToDefault()}
					</button>
				)}
			</PopoverContent>
		</Popover>
	)
}
