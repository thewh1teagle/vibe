import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/style'

/** Holding a step button repeats it — after a pause, then quickly, like a scrollbar arrow. */
const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 60

interface NumberFieldProps {
	value: number
	onChange: (value: number) => void
	min?: number
	max?: number
	/** How much one press of − / + moves the value. Also the precision the value is rounded to. */
	step?: number
	/** Shown after the number, e.g. "min" or "threads". */
	suffix?: string
	/**
	 * Words for the values that don't read as numbers — 0 meaning "never", -1 meaning "automatic".
	 * Return undefined to show the number itself.
	 */
	format?: (value: number) => string | undefined
	className?: string
	'aria-label'?: string
}

function decimalsOf(step: number) {
	const text = String(step)
	const dot = text.indexOf('.')
	return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * A number setting you can nudge or type into: one bordered control with − and + on the ends and
 * the value in the middle. Browser spinners are tiny, hover-only and unlabelled; these are always
 * visible, repeat when held, stop at the range's ends and never leave the field in a half-typed
 * state — the draft is only committed (and clamped) when you leave the field or press Enter.
 */
export default function NumberField({ value, onChange, min, max, step = 1, suffix, format, className, ...rest }: NumberFieldProps) {
	const [draft, setDraft] = useState<string | null>(null)
	const repeat = useRef<{ delay?: number; interval?: number }>({})

	const decimals = decimalsOf(step)
	const lowerBound = min ?? Number.NEGATIVE_INFINITY
	const upperBound = max ?? Number.POSITIVE_INFINITY

	function clamp(next: number) {
		const bounded = Math.min(upperBound, Math.max(lowerBound, next))
		return Number(bounded.toFixed(decimals))
	}

	function nudge(direction: 1 | -1) {
		onChange(clamp(value + direction * step))
	}

	function stopRepeating() {
		window.clearTimeout(repeat.current.delay)
		window.clearInterval(repeat.current.interval)
		repeat.current = {}
	}

	function startRepeating(direction: 1 | -1) {
		nudge(direction)
		repeat.current.delay = window.setTimeout(() => {
			repeat.current.interval = window.setInterval(() => nudge(direction), REPEAT_INTERVAL_MS)
		}, REPEAT_DELAY_MS)
	}

	useEffect(() => stopRepeating, [])

	function commit() {
		if (draft === null) return
		const parsed = Number(draft.replace(',', '.'))
		setDraft(null)
		// Anything unreadable leaves the setting where it was rather than snapping it to zero.
		if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed))
	}

	const atMin = value <= lowerBound
	const atMax = value >= upperBound
	const display = draft ?? format?.(value) ?? String(value)

	const stepButton =
		'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30'

	return (
		<div
			dir="ltr"
			className={cn('flex h-9 items-center gap-0.5 rounded-full border border-border/70 bg-transparent px-1 transition-colors duration-150', className)}>
			<button
				type="button"
				aria-hidden
				tabIndex={-1}
				disabled={atMin}
				onPointerDown={() => startRepeating(-1)}
				onPointerUp={stopRepeating}
				onPointerLeave={stopRepeating}
				className={stepButton}>
				<Minus className="h-3.5 w-3.5" />
			</button>

			<span className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
				<input
					inputMode="decimal"
					autoComplete="off"
					role="spinbutton"
					aria-valuenow={value}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-label={rest['aria-label']}
					value={display}
					onFocus={(event) => {
						setDraft(String(value))
						event.currentTarget.select()
					}}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							commit()
							event.currentTarget.blur()
						} else if (event.key === 'Escape') {
							event.preventDefault()
							setDraft(null)
							event.currentTarget.blur()
						} else if (event.key === 'ArrowUp') {
							event.preventDefault()
							setDraft(null)
							nudge(1)
						} else if (event.key === 'ArrowDown') {
							event.preventDefault()
							setDraft(null)
							nudge(-1)
						}
					}}
					// Sized to its content so the control stays compact whatever the number is.
					style={{ width: `${Math.max(2, display.length)}ch` }}
					className="bg-transparent text-center text-sm tabular-nums text-foreground outline-none"
				/>
				{suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
			</span>

			<button
				type="button"
				aria-hidden
				tabIndex={-1}
				disabled={atMax}
				onPointerDown={() => startRepeating(1)}
				onPointerUp={stopRepeating}
				onPointerLeave={stopRepeating}
				className={stepButton}>
				<Plus className="h-3.5 w-3.5" />
			</button>
		</div>
	)
}
