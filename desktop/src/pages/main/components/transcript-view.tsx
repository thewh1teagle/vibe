import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import HTMLView from '~/components/html-view'
import { formatTimestamp, type Segment } from '~/lib/transcript'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { useSession } from '../session'
import type { Job } from '../hooks/use-transcribe-queue'
import { PLAYER_SEEK_EVENT } from './player-bar'

/** Segment timestamps are centiseconds (see `formatTimestamp` / `asJson` in lib/transcript). */
const CENTISECONDS_PER_SECOND = 100

function Highlight({ text, query }: { text: string; query: string }) {
	if (!query) return <>{text}</>
	const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
	return (
		<>
			{parts.map((part, index) =>
				part.toLowerCase() === query.toLowerCase() ? (
					<mark key={index} className="rounded bg-primary/15 text-foreground">
						{part}
					</mark>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	)
}

/** Typography shared by the static text and the editor, so swapping one for the other is invisible. */
const textClass = 'text-[15px] leading-[1.75] text-foreground'

interface SegmentBlockProps {
	segment: Segment
	/** index inside `job.segments` — search filtering means it is not the render index */
	index: number
	query: string
	animate: boolean
	editable: boolean
	editing: boolean
	onStartEdit: (index: number, indent: number) => void
	onCancel: () => void
	onCommit: (index: number, text: string) => void
	/** distance from the paragraph's inline start to where the text begins, measured on open */
	indent: number
}

function SegmentBlock({ segment, index, query, animate, editable, editing, onStartEdit, onCancel, onCommit, indent }: SegmentBlockProps) {
	const paragraphRef = useRef<HTMLParagraphElement>(null)
	const markerRef = useRef<HTMLSpanElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	// Set once the edit ended, so the blur that follows a commit or a cancel does not commit again.
	const settledRef = useRef(false)
	const [draft, setDraft] = useState('')

	const text = segment.text.trim()

	function beginEdit() {
		if (!editable || editing) return
		const paragraph = paragraphRef.current
		const marker = markerRef.current
		let measured = 0
		if (paragraph && marker) {
			const box = paragraph.getBoundingClientRect()
			const at = marker.getBoundingClientRect()
			const rtl = window.getComputedStyle(paragraph).direction === 'rtl'
			measured = Math.max(0, Math.round(rtl ? box.right - at.right : at.left - box.left))
		}
		settledRef.current = false
		setDraft(text)
		onStartEdit(index, measured)
	}

	// Focus with the caret at the end, the moment the editor takes over.
	useEffect(() => {
		if (!editing) return
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.focus()
		const end = textarea.value.length
		textarea.setSelectionRange(end, end)
		return () => {
			// Closed from the outside (file switch, search): whatever blur follows must not commit.
			settledRef.current = true
		}
	}, [editing])

	function commit() {
		if (settledRef.current) return
		settledRef.current = true
		const next = draft.trim()
		// An empty segment would be lost text, not an edit: fall back to what was there.
		if (next) onCommit(index, next)
		else onCancel()
	}

	function cancel() {
		if (settledRef.current) return
		settledRef.current = true
		onCancel()
	}

	function seek() {
		window.dispatchEvent(new CustomEvent(PLAYER_SEEK_EVENT, { detail: { seconds: segment.start / CENTISECONDS_PER_SECOND } }))
	}

	return (
		<motion.p
			ref={paragraphRef}
			initial={animate ? { opacity: 0, y: 4 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, ease: 'easeOut' }}
			className={cn('relative', textClass)}>
			<button
				type="button"
				onClick={seek}
				aria-label={`Play from ${formatTimestamp(segment.start, false, '', false)}`}
				className="me-3 cursor-pointer font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums underline-offset-4 transition-colors duration-150 select-none hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80">
				{formatTimestamp(segment.start, false, '', false)}
			</button>
			{segment.speaker != null && (
				<span className="me-2 text-[11px] font-semibold text-muted-foreground">
					{m.speakerPrefix()} {segment.speaker + 1}
				</span>
			)}
			{/* Zero-width anchor marking where the text starts, so the editor can indent its first line to match. */}
			<span ref={markerRef} aria-hidden className="inline-block w-0 align-baseline" />

			{editing ? (
				<>
					{/* The draft, invisible: it keeps the paragraph exactly as tall as the text being typed. */}
					<span aria-hidden className="invisible whitespace-pre-wrap">
						{draft || ' '}
					</span>
					<textarea
						ref={textareaRef}
						value={draft}
						rows={1}
						spellCheck={false}
						aria-label="Edit line"
						onChange={(event) => setDraft(event.target.value)}
						onBlur={commit}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault()
								commit()
							} else if (event.key === 'Escape') {
								event.preventDefault()
								cancel()
							}
						}}
						style={{ textIndent: `${indent}px` }}
						className={cn(
							'absolute inset-0 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none focus:ring-0',
							textClass,
						)}
					/>
				</>
			) : editable ? (
				<span
					role="button"
					tabIndex={0}
					onClick={beginEdit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							beginEdit()
						}
					}}
					className="cursor-text rounded-sm transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80">
					<Highlight text={text} query={query} />
				</span>
			) : (
				<Highlight text={text} query={query} />
			)}
		</motion.p>
	)
}

export default function TranscriptView({ job, query }: { job: Job; query: string }) {
	const preference = usePreferenceProvider()
	const { queue } = useSession()
	const scrollRef = useRef<HTMLDivElement>(null)
	const running = job.status === 'running'
	const editable = !running && (job.status === 'done' || job.hydrated === true)

	const [editing, setEditing] = useState<{ index: number; indent: number } | null>(null)

	// Filtering keeps the original index so an edit lands on the right segment.
	const visible = useMemo(() => {
		const all = job.segments.map((segment, index) => ({ segment, index }))
		if (!query) return all
		return all.filter(({ segment }) => segment.text.toLowerCase().includes(query.toLowerCase()))
	}, [job.segments, query])

	// Switching file, searching or a new run must never leave an editor open over other text.
	useEffect(() => {
		setEditing(null)
	}, [job.id, query])

	useEffect(() => {
		if (!editable) setEditing(null)
	}, [editable])

	useEffect(() => {
		if (!running) return
		const node = scrollRef.current
		if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
	}, [job.segments.length, running])

	const startEdit = useCallback((index: number, indent: number) => setEditing({ index, indent }), [])
	const cancelEdit = useCallback(() => setEditing(null), [])
	const commitEdit = useCallback(
		(index: number, text: string) => {
			setEditing(null)
			queue.updateSegmentText(job.id, index, text)
		},
		[job.id, queue],
	)

	return (
		<div ref={scrollRef} className="h-full min-h-0 overflow-y-auto">
			<div dir={preference.textAreaDirection} className="mx-auto w-full max-w-[68ch] px-8 py-10">
				<p className="mb-8 truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{job.name}</p>

				{job.status === 'error' && <p className="mb-8 text-sm text-destructive">{job.error}</p>}

				{visible.length === 0 && (
					<p className="text-sm text-muted-foreground">
						{query ? 'No matching lines.' : running ? m.transcriptWillDisplayedShortly() : job.status === 'queued' ? m.loading() : ''}
					</p>
				)}

				<div className="space-y-6">
					{visible.map(({ segment, index }) => (
						<SegmentBlock
							key={`${segment.start}-${index}`}
							segment={segment}
							index={index}
							query={query}
							animate={running}
							editable={editable}
							editing={editing?.index === index}
							indent={editing?.index === index ? editing.indent : 0}
							onStartEdit={startEdit}
							onCancel={cancelEdit}
							onCommit={commitEdit}
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
	)
}
