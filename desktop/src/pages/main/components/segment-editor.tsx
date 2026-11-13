import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { cn } from '~/lib/style'

/** Where an edit should put the caret when the editor opens. */
export type CaretIntent = { start: number; end: number } | 'start' | 'end'

/**
 * Character offset inside `element` for a viewport point — this is what makes a click land the caret
 * where the pointer is instead of at the end of the line.
 */
export function offsetFromPoint(element: HTMLElement, x: number, y: number): number | null {
	const document_ = element.ownerDocument
	let container: Node | null = null
	let offset = 0
	// caretRangeFromPoint is the WebKit/Chromium spelling, caretPositionFromPoint the standard one.
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
	} catch {
		return null
	}
	return measure.toString().length
}

/** The selection the user dragged inside `element`, as offsets into its text. */
export function selectionRangeIn(element: HTMLElement): { start: number; end: number } | null {
	const selection = element.ownerDocument.getSelection()
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
	const range = selection.getRangeAt(0)
	if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null
	const measure = element.ownerDocument.createRange()
	measure.selectNodeContents(element)
	try {
		measure.setEnd(range.startContainer, range.startOffset)
		const start = measure.toString().length
		measure.setEnd(range.endContainer, range.endOffset)
		const end = measure.toString().length
		return { start, end }
	} catch {
		return null
	}
}

interface SegmentEditorProps {
	initialText: string
	caret: CaretIntent
	textSizeClassName: string
	onCommit: (text: string, then?: 'next' | 'previous') => void
	onCancel: () => void
	onMove: (direction: 1 | -1, caret: CaretIntent) => void
}

/**
 * Mounted only while a line is being edited, so every edit starts from the segment's current text —
 * and the caret lands where the click did instead of at the end.
 */
export function SegmentEditor({ initialText, caret, textSizeClassName, onCommit, onCancel, onMove }: SegmentEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	// Set once the edit ended, so the blur that follows a commit or a cancel does not commit again.
	const settledRef = useRef(false)
	const [draft, setDraft] = useState(initialText)

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		const length = textarea.value.length
		const range = caret === 'start' ? { start: 0, end: 0 } : caret === 'end' ? { start: length, end: length } : caret
		textarea.focus({ preventScroll: true })
		textarea.setSelectionRange(Math.min(range.start, length), Math.min(range.end, length))
		return () => {
			// Closed from the outside (file switch, search): whatever blur follows must not commit.
			settledRef.current = true
		}
	}, [])

	// The editor grows with the text instead of scrolling inside a fixed box.
	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = 'auto'
		textarea.style.height = `${textarea.scrollHeight}px`
	}, [draft])

	function commit(then?: 'next' | 'previous') {
		if (settledRef.current) return
		settledRef.current = true
		const next = draft.trim()
		// An empty segment would be lost text, not an edit: fall back to what was there.
		if (next && next !== initialText) onCommit(next, then)
		else if (then) onMove(then === 'next' ? 1 : -1, then === 'next' ? 'start' : 'end')
		else onCancel()
	}

	function cancel() {
		if (settledRef.current) return
		settledRef.current = true
		onCancel()
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		const textarea = event.currentTarget
		if (event.key === 'Escape') {
			event.preventDefault()
			cancel()
			return
		}
		// Enter moves to the next line the way a list editor does; Shift+Enter breaks the line.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			commit('next')
			return
		}
		if (event.key === 'Tab') {
			event.preventDefault()
			commit(event.shiftKey ? 'previous' : 'next')
			return
		}
		const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
		const atEnd = textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length
		if (event.key === 'ArrowUp' && atStart) {
			event.preventDefault()
			commit('previous')
			return
		}
		if (event.key === 'ArrowDown' && atEnd) {
			event.preventDefault()
			commit('next')
		}
	}

	return (
		<textarea
			ref={textareaRef}
			value={draft}
			rows={1}
			autoComplete="off"
			autoCorrect="off"
			autoCapitalize="none"
			spellCheck={false}
			aria-label={m.editLine()}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => commit()}
			onKeyDown={onKeyDown}
			className={cn(
				'block w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 text-foreground outline-none focus:outline-none focus:ring-0',
				textSizeClassName,
			)}
		/>
	)
}
