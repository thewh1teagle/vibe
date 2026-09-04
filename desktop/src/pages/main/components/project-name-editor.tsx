import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'

/** Text offset under a pointer before the static title is replaced by its input. */
function caretOffsetFromPoint(element: HTMLElement, x: number, y: number): number | null {
	if (!x && !y) return null
	const document_ = element.ownerDocument
	let container: Node | null = null
	let offset = 0
	const legacy = (document_ as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint
	if (legacy) {
		const range = legacy.call(document_, x, y)
		if (range) {
			container = range.startContainer
			offset = range.startOffset
		}
	} else if (document_.caretPositionFromPoint) {
		const position = document_.caretPositionFromPoint(x, y)
		if (position) {
			container = position.offsetNode
			offset = position.offset
		}
	}
	if (!container || !element.contains(container)) return null
	const measure = document_.createRange()
	measure.selectNodeContents(element)
	try {
		measure.setEnd(container, offset)
		return measure.toString().length
	} catch {
		return null
	}
}

export function ProjectNameEditor({
	name,
	disabled,
	onDraftChange,
	onRename,
}: {
	name: string
	disabled?: boolean
	onDraftChange: (name: string) => void
	onRename: (name: string) => Promise<boolean>
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const titleRef = useRef<HTMLSpanElement>(null)
	const requestedCaretRef = useRef<number | null>(null)
	const finishingRef = useRef(false)
	const originalNameRef = useRef(name)
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(name)

	useEffect(() => {
		if (!editing) setDraft(name)
	}, [editing, name])

	useEffect(() => {
		if (!editing) return
		const input = inputRef.current
		if (!input) return
		input.focus({ preventScroll: true })
		const caret = Math.min(requestedCaretRef.current ?? input.value.length, input.value.length)
		input.setSelectionRange(caret, caret)
	}, [editing])

	async function finish(save: boolean) {
		if (finishingRef.current) return
		finishingRef.current = true
		const next = draft.trim()
		if (!save || !next) {
			onDraftChange(originalNameRef.current)
			setEditing(false)
			return
		}
		if (next === originalNameRef.current) {
			onDraftChange(next)
			setEditing(false)
			return
		}
		const renamed = await onRename(next)
		if (renamed) setEditing(false)
		else {
			finishingRef.current = false
			inputRef.current?.focus()
		}
	}

	if (editing) {
		return (
			<input
				ref={inputRef}
				value={draft}
				onChange={(event) => {
					setDraft(event.target.value)
					onDraftChange(event.target.value)
				}}
				onBlur={() => void finish(true)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault()
						void finish(true)
					}
					if (event.key === 'Escape') {
						event.preventDefault()
						void finish(false)
					}
				}}
				aria-label={m.transcriptName()}
				className="mb-8 block h-auto w-full border-0 bg-transparent p-0 font-sans text-base font-semibold tracking-tight text-foreground outline-none focus:outline-none focus:ring-0"
			/>
		)
	}

	return (
		<button
			type="button"
			disabled={disabled}
			title={disabled ? undefined : m.rename()}
			onClick={(event) => {
				finishingRef.current = false
				originalNameRef.current = name
				requestedCaretRef.current = titleRef.current ? caretOffsetFromPoint(titleRef.current, event.clientX, event.clientY) : null
				setDraft(name)
				setEditing(true)
			}}
			className="mb-8 block max-w-full cursor-text truncate border-0 bg-transparent p-0 text-start font-sans text-base font-semibold tracking-tight text-foreground outline-none disabled:cursor-default">
			<span ref={titleRef} className="truncate">
				{name}
			</span>
		</button>
	)
}
