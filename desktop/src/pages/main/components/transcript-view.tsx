import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import HTMLView from '~/components/html-view'
import Markdown from 'react-markdown'
import { Spinner } from '~/components/ui/spinner'
import { formatTimestamp, type Segment } from '~/lib/transcript'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { useSession } from '../session'
import type { Job } from '../hooks/use-transcribe-queue'
import { textSizeClass, type TranscriptTab, type TranscriptViewOptions } from '../hooks/use-transcript-view'
import { PLAYER_SEEK_EVENT, PLAYER_TOGGLE_EVENT, PLAYER_TIME_EVENT, type PlayerTimeDetail } from './player-bar'

/** Segment timestamps are centiseconds (see `formatTimestamp` / `asJson` in lib/transcript). */
const CENTISECONDS_PER_SECOND = 100

/** Where an edit should put the caret when the editor opens. */
type CaretIntent = { start: number; end: number } | 'start' | 'end'

interface EditTarget {
	index: number
	caret: CaretIntent
}

function Highlight({ text, query }: { text: string; query: string }) {
	if (!query) return <>{text}</>
	const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
	return (
		<>
			{parts.map((part, index) =>
				part.toLowerCase() === query.toLowerCase() ? (
					<mark key={index} className="rounded bg-primary/20 text-foreground">
						{part}
					</mark>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	)
}

/**
 * Character offset inside `element` for a viewport point — this is what makes a click land the caret
 * where the pointer is instead of at the end of the line.
 */
function offsetFromPoint(element: HTMLElement, x: number, y: number): number | null {
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
function selectionRangeIn(element: HTMLElement): { start: number; end: number } | null {
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
function SegmentEditor({ initialText, caret, textSizeClassName, onCommit, onCancel, onMove }: SegmentEditorProps) {
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

interface SegmentBlockProps {
	segment: Segment
	/** index inside `job.segments` — search filtering means it is not the render index */
	index: number
	query: string
	animate: boolean
	editable: boolean
	editing: EditTarget | null
	active: boolean
	options: TranscriptViewOptions
	onStartEdit: (index: number, caret: CaretIntent) => void
	onCancel: () => void
	onCommit: (index: number, text: string, then?: 'next' | 'previous') => void
	onMove: (index: number, direction: 1 | -1, caret: CaretIntent) => void
}

function SegmentBlock({ segment, index, query, animate, editable, editing, active, options, onStartEdit, onCancel, onCommit, onMove }: SegmentBlockProps) {
	const textRef = useRef<HTMLSpanElement>(null)

	const text = segment.text.trim()
	const isEditing = editing !== null

	function beginEditFromPointer(event: React.MouseEvent) {
		if (!editable || isEditing) return
		const node = textRef.current
		if (!node) return
		// A drag-selection carries into the editor; a plain click drops the caret where it landed.
		const selected = selectionRangeIn(node)
		const at = selected ?? offsetFromPoint(node, event.clientX, event.clientY)
		onStartEdit(index, typeof at === 'number' ? { start: at, end: at } : (at ?? 'end'))
	}

	function seek() {
		window.dispatchEvent(new CustomEvent(PLAYER_SEEK_EVENT, { detail: { seconds: segment.start / CENTISECONDS_PER_SECOND } }))
	}

	const timestamp = formatTimestamp(segment.start, false, '', false)

	return (
		<motion.div
			data-segment-index={index}
			initial={animate ? { opacity: 0, y: 4 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, ease: 'easeOut' }}
			className={cn(
				'group relative -mx-3 flex gap-3 rounded-xl px-3 py-2 transition-colors duration-150',
				!active && editable && !isEditing && 'hover:bg-muted/40',
			)}>
			{/*
			 * The line being spoken gets a wash that fades out along the text instead of a block of
			 * colour with a hard edge — it reads as lighting rather than selection, and it can cross-fade.
			 */}
			<span
				aria-hidden
				className={cn(
					'pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-foreground/[0.07] via-foreground/[0.04] to-transparent transition-opacity duration-500 ease-out rtl:bg-gradient-to-l',
					active ? 'opacity-100' : 'opacity-0',
				)}
			/>

			{/* Gutter: the timestamp doubles as the play button, so playing a line is one click. */}
			<button
				type="button"
				onClick={seek}
				aria-label={m.playFromHere()}
				title={timestamp}
				className={cn(
					'group/play relative z-10 mt-[3px] flex h-5 shrink-0 cursor-pointer items-center justify-end rounded-sm font-mono text-[11px] tracking-tight tabular-nums transition-colors duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
					options.showTimestamps ? 'w-[52px]' : 'w-4',
					active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
				)}>
				{options.showTimestamps && <span className="transition-opacity duration-150 group-hover/play:opacity-0">{timestamp}</span>}
				<Play
					aria-hidden
					className={cn(
						'h-3 w-3 fill-current transition-opacity duration-150',
						options.showTimestamps ? 'absolute end-0 opacity-0 group-hover/play:opacity-100' : 'opacity-0 group-hover:opacity-100',
					)}
				/>
			</button>

			<div className="relative min-w-0 flex-1">
				{options.showSpeakers && segment.speaker != null && (
					<span className="me-2 align-baseline text-[11px] font-semibold text-muted-foreground">
						{m.speakerPrefix()} {segment.speaker + 1}
					</span>
				)}

				{editing ? (
					<SegmentEditor
						initialText={text}
						caret={editing.caret}
						textSizeClassName={textSizeClass[options.textSize]}
						onCommit={(next, then) => onCommit(index, next, then)}
						onCancel={onCancel}
						onMove={(direction, caret) => onMove(index, direction, caret)}
					/>
				) : (
					<span
						ref={textRef}
						role={editable ? 'textbox' : undefined}
						tabIndex={editable ? 0 : undefined}
						onClick={editable ? beginEditFromPointer : undefined}
						onKeyDown={(event) => {
							if (!editable) return
							if (event.key === 'Enter') {
								event.preventDefault()
								onStartEdit(index, 'end')
							}
						}}
						className={cn(
							'block whitespace-pre-wrap text-foreground',
							textSizeClass[options.textSize],
							editable && 'cursor-text rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
						)}>
						<Highlight text={text} query={query} />
					</span>
				)}
			</div>
		</motion.div>
	)
}

export default function TranscriptView({
	job,
	query,
	options,
	tab = 'transcript',
}: {
	job: Job
	query: string
	options: TranscriptViewOptions
	tab?: TranscriptTab
}) {
	const preference = usePreferenceProvider()
	const { queue, summaries } = useSession()
	const scrollRef = useRef<HTMLDivElement>(null)
	const running = job.status === 'running'
	const editable = !running && (job.status === 'done' || job.hydrated === true)

	const [editing, setEditing] = useState<EditTarget | null>(null)
	const [activeIndex, setActiveIndex] = useState(-1)
	const [following, setFollowing] = useState(true)
	// The jump pill is a reaction to scrolling away, so it fades out again shortly after.
	const [jumpVisible, setJumpVisible] = useState(false)
	const jumpTimer = useRef(0)
	// Scrolls we trigger ourselves must not be mistaken for the user taking over.
	const autoScrollRef = useRef(0)

	// Filtering keeps the original index so an edit lands on the right segment.
	const visible = useMemo(() => {
		const all = job.segments.map((segment, index) => ({ segment, index }))
		if (!query) return all
		return all.filter(({ segment }) => segment.text.toLowerCase().includes(query.toLowerCase()))
	}, [job.segments, query])

	// Switching file, searching or a new run must never leave an editor open over other text.
	useEffect(() => {
		setEditing(null)
		setActiveIndex(-1)
		setFollowing(true)
	}, [job.id])

	useEffect(() => {
		setEditing(null)
	}, [query])

	useEffect(() => {
		if (!editable) setEditing(null)
	}, [editable])

	// The line being spoken, from the player's position broadcast.
	useEffect(() => {
		function onTime(event: Event) {
			const detail = (event as CustomEvent<PlayerTimeDetail>).detail
			if (!detail || !Number.isFinite(detail.seconds)) return
			const at = detail.seconds * CENTISECONDS_PER_SECOND
			const segments = job.segments
			let found = -1
			for (let index = 0; index < segments.length; index += 1) {
				if (segments[index].start <= at) found = index
				else break
			}
			// Past the end of a segment with a gap before the next one, nothing is being spoken.
			if (found >= 0 && segments[found].stop && at > segments[found].stop) found = -1
			setActiveIndex((previous) => (previous === found ? previous : found))
		}
		window.addEventListener(PLAYER_TIME_EVENT, onTime)
		return () => window.removeEventListener(PLAYER_TIME_EVENT, onTime)
	}, [job.segments])

	// Follow along, unless the reader has scrolled away or is editing a line.
	useEffect(() => {
		if (!following || activeIndex < 0 || editing) return
		const node = scrollRef.current?.querySelector(`[data-segment-index="${activeIndex}"]`)
		if (!node) return
		autoScrollRef.current = Date.now()
		node.scrollIntoView({ block: 'center', behavior: 'smooth' })
	}, [activeIndex, following, editing])

	useEffect(() => {
		if (!running) return
		const node = scrollRef.current
		if (node) {
			autoScrollRef.current = Date.now()
			node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
		}
	}, [job.segments.length, running])

	// Spacebar plays and pauses while reading — never while typing into the transcript.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== ' ' && event.code !== 'Space') return
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const target = event.target as HTMLElement | null
			if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
			event.preventDefault()
			window.dispatchEvent(new CustomEvent(PLAYER_TOGGLE_EVENT))
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	function onScroll() {
		// Smooth auto-scrolls keep firing for a moment; only scrolls outside that window are the user's.
		if (Date.now() - autoScrollRef.current < 700) return
		if (following) setFollowing(false)
		// Shown whether or not the audio is running — it is about finding the line again, not playback.
		setJumpVisible(true)
		window.clearTimeout(jumpTimer.current)
		jumpTimer.current = window.setTimeout(() => setJumpVisible(false), 3000)
	}

	useEffect(() => () => window.clearTimeout(jumpTimer.current), [])

	function jumpToPlaying() {
		setFollowing(true)
		setJumpVisible(false)
		window.clearTimeout(jumpTimer.current)
		const node = scrollRef.current?.querySelector(`[data-segment-index="${activeIndex}"]`)
		if (node) {
			autoScrollRef.current = Date.now()
			node.scrollIntoView({ block: 'center', behavior: 'smooth' })
		}
	}

	const startEdit = useCallback((index: number, caret: CaretIntent) => setEditing({ index, caret }), [])
	const cancelEdit = useCallback(() => setEditing(null), [])

	/** Move the editor to the neighbouring visible line, so a transcript can be fixed without the mouse. */
	const moveEdit = useCallback(
		(index: number, direction: 1 | -1, caret: CaretIntent) => {
			const position = visible.findIndex((entry) => entry.index === index)
			const next = visible[position + direction]
			setEditing(next ? { index: next.index, caret } : null)
		},
		[visible],
	)

	const commitEdit = useCallback(
		(index: number, text: string, then?: 'next' | 'previous') => {
			queue.updateSegmentText(job.id, index, text)
			if (then) moveEdit(index, then === 'next' ? 1 : -1, then === 'next' ? 'start' : 'end')
			else setEditing(null)
		},
		[job.id, moveEdit, queue],
	)

	const showJump = jumpVisible && !following && activeIndex >= 0 && tab === 'transcript'
	const summarizing = Boolean(summaries.pending[job.id])

	if (tab === 'summary') {
		return (
			<div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
				<div dir={preference.textAreaDirection} className="mx-auto w-full max-w-[86ch] px-8 py-10 xl:max-w-[96ch]">
					<p className="mb-8 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.summaryTab()}</p>

					{job.summary ? (
						// The models answer in markdown; render it rather than showing the syntax.
						<div className={cn('prose prose-neutral max-w-none dark:prose-invert', textSizeClass[options.textSize])}>
							<Markdown>{job.summary}</Markdown>
						</div>
					) : (
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-3.5 w-3.5" />
							{m.summarizeLoading()}
						</p>
					)}

					{job.summary && summarizing && (
						<p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-3.5 w-3.5" />
							{m.summarizeLoading()}
						</p>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className="relative h-full min-h-0">
			{/* overflow-x-hidden: the offscreen export copy below must not become a sideways scroll in RTL. */}
			<div ref={scrollRef} onScroll={onScroll} className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
				<div dir={preference.textAreaDirection} className="mx-auto w-full max-w-[86ch] px-8 py-10 xl:max-w-[96ch]">
					<p className="mb-8 truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{job.name}</p>

					{job.status === 'error' && <p className="mb-8 text-sm text-destructive">{job.error}</p>}

					{visible.length === 0 && (
						<p className="text-sm text-muted-foreground">
							{query ? m.noMatchingLines() : running ? m.transcriptWillDisplayedShortly() : job.status === 'queued' ? m.loading() : ''}
						</p>
					)}

					<div className="space-y-1">
						{visible.map(({ segment, index }) => (
							<SegmentBlock
								key={`${segment.start}-${index}`}
								segment={segment}
								index={index}
								query={query}
								animate={running}
								editable={editable}
								editing={editing?.index === index ? editing : null}
								active={activeIndex === index}
								options={options}
								onStartEdit={startEdit}
								onCancel={cancelEdit}
								onCommit={commitEdit}
								onMove={moveEdit}
							/>
						))}
					</div>

					{running && <div className={cn('mt-8 h-4 w-24 animate-pulse rounded-full bg-muted')} />}
				</div>

				{/* Offscreen source for the html / pdf exports (print CSS pulls `.html` back on-page). */}
				{job.segments.length > 0 && (
					<div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] w-[1000px]">
						<HTMLView preference={preference} segments={job.segments} file={{ name: job.name, path: job.path }} />
					</div>
				)}
			</div>

			{/* Scrolling away stops the follow; this brings it back instead of hunting for the line. */}
			{/* AnimatePresence keeps the pill mounted long enough to fade back out. */}
			<AnimatePresence>
				{showJump && (
					<motion.button
						type="button"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 6 }}
						transition={{ duration: 0.2, ease: 'easeOut' }}
						onClick={jumpToPlaying}
						className="absolute bottom-4 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur transition-colors duration-150 hover:bg-muted">
						<ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
						{m.jumpToPlaying()}
					</motion.button>
				)}
			</AnimatePresence>
		</div>
	)
}
