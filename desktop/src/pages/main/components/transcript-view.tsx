import { AnimatePresence, motion } from 'framer-motion'
import { defaultRangeExtractor, useVirtualizer, type Range as VirtualRange } from '@tanstack/react-virtual'
import { ArrowDownToLine, AudioLines } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection } from '~/paraglide/runtime.js'
import { Button } from '~/components/ui/button'
import { groupSegments, replaceSentence, segmentsOf, type Paragraph, type Sentence } from '~/lib/transcript-grouping'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { useSession } from '../session'
import type { Job } from '../hooks/use-transcribe-queue'
import type { TranscriptTab, TranscriptViewOptions } from '../hooks/use-transcript-view'
import { PLAYER_TOGGLE_EVENT, PLAYER_TIME_EVENT, type PlayerTimeDetail } from './player-bar'
import PreparingState, { isPreparing } from './preparing-state'
import { ProjectNameEditor } from './project-name-editor'
import QuietRow from './quiet-row'
import type { CaretIntent } from './segment-editor'
import SummaryView from './summary-view'
import TranscriptRow, { CENTISECONDS_PER_SECOND, type EditTarget } from './transcript-row'

/** Keys that scroll the transcript, so pressing one means the reader is steering. */
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']

/** How close to the tail counts as being back at the bottom, in pixels. */
const BOTTOM_STICK_PX = 96

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
	const interfaceDirection = getTextDirection(getLocale())
	const { queue } = useSession()
	const scrollRef = useRef<HTMLDivElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const running = job.status === 'running'
	const editable = !running && (job.status === 'done' || job.hydrated === true)

	const [editing, setEditing] = useState<EditTarget | null>(null)
	const [activeId, setActiveId] = useState(-1)
	const [playing, setPlaying] = useState(false)
	const [following, setFollowing] = useState(true)
	const [scrollMargin, setScrollMargin] = useState(0)
	// The jump pill is a reaction to scrolling away, so it fades out again shortly after.
	const [jumpVisible, setJumpVisible] = useState(false)
	const jumpTimer = useRef(0)
	const followingRef = useRef(following)
	const playingRef = useRef(playing)
	followingRef.current = following
	playingRef.current = playing

	// The rows on screen: the engine's own lines, or the same words rebuilt as sentences or paragraphs.
	const rows = useMemo(() => groupSegments(job.segments, options.lines), [job.segments, options.lines])
	const sentences = useMemo(() => rows.flatMap((row) => row.sentences), [rows])
	const visible = useMemo(() => {
		if (!query) return rows
		const needle = query.toLowerCase()
		return rows.filter((row) => row.sentences.some((sentence) => sentence.text.toLowerCase().includes(needle)))
	}, [rows, query])
	const visibleSentences = useMemo(() => visible.flatMap((row) => row.sentences), [visible])
	/** Which visible row holds each sentence, so playback and edits can find their row. */
	const rowOf = useMemo(() => {
		const positions = new Map<number, number>()
		visible.forEach((row, position) => row.sentences.forEach((sentence) => positions.set(sentence.id, position)))
		return positions
	}, [visible])

	const editingVisibleIndex = editing ? (rowOf.get(editing.id) ?? -1) : -1
	const extractRange = useCallback(
		(range: VirtualRange) => {
			const indexes = defaultRangeExtractor(range)
			if (editingVisibleIndex >= 0 && !indexes.includes(editingVisibleIndex)) indexes.push(editingVisibleIndex)
			return indexes.sort((a, b) => a - b)
		},
		[editingVisibleIndex],
	)
	const rowVirtualizer = useVirtualizer({
		count: visible.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 48,
		getItemKey: (position) => {
			const row = visible[position]
			return row ? `${options.lines}-${row.sentences[0].id}` : position
		},
		measureElement: (element) => element.getBoundingClientRect().height,
		overscan: 8,
		gap: 4,
		rangeExtractor: extractRange,
		scrollMargin,
	})

	// The list starts below a variable-height heading/error/empty state. Virtual row offsets are
	// relative to the scroll element, so keep that margin current as those blocks change.
	useLayoutEffect(() => {
		const list = listRef.current
		if (!list) return
		const update = () => setScrollMargin((current) => (current === list.offsetTop ? current : list.offsetTop))
		update()
		const observer = new ResizeObserver(update)
		if (list.parentElement) observer.observe(list.parentElement)
		return () => observer.disconnect()
	}, [job.id, job.status, query, visible.length, options.lines])

	// Switching file, searching or a new run must never leave an editor open over other text.
	useEffect(() => {
		setEditing(null)
		setActiveId(-1)
		setPlaying(false)
		setFollowing(true)
	}, [job.id])

	useEffect(() => {
		setEditing(null)
	}, [query, options.lines])

	useEffect(() => {
		if (!editable) setEditing(null)
	}, [editable])

	// The line being spoken, from the player's position broadcast.
	useEffect(() => {
		function onTime(event: Event) {
			const detail = (event as CustomEvent<PlayerTimeDetail>).detail
			if (!detail || !Number.isFinite(detail.seconds)) return
			setPlaying(detail.playing)
			if (!detail.playing) setJumpVisible(false)
			const at = detail.seconds * CENTISECONDS_PER_SECOND
			let found = -1
			for (const sentence of sentences) {
				if (sentence.start <= at) found = sentence.id
				else break
			}
			// Past the end of a sentence with a gap before the next one, nothing is being spoken.
			if (found >= 0 && sentences[found].stop && at > sentences[found].stop) found = -1
			setActiveId((previous) => (previous === found ? previous : found))
		}
		window.addEventListener(PLAYER_TIME_EVENT, onTime)
		return () => window.removeEventListener(PLAYER_TIME_EVENT, onTime)
	}, [sentences])

	// Follow along, unless the reader has scrolled away or is editing a line.
	useEffect(() => {
		if (!following || activeId < 0 || editing) return
		const position = rowOf.get(activeId)
		if (position == null) return
		rowVirtualizer.scrollToIndex(position, { align: 'center' })
	}, [activeId, following, editing, rowVirtualizer, rowOf])

	// Ride the tail of a running transcription — but only while the reader is still following.
	useEffect(() => {
		if (!running || !following || editing || visible.length === 0) return
		rowVirtualizer.scrollToIndex(visible.length - 1, { align: 'end' })
	}, [job.segments.length, editing, following, rowVirtualizer, running, visible.length])

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

	/**
	 * Hand the scroll position to the reader. Driven by input events rather than by `scroll`: while a
	 * transcription streams in, our own scrolls fire faster than any "was that us?" window could tell
	 * them apart, and a reader looking back would keep being dragged to the tail.
	 */
	const releaseFollow = useCallback(() => {
		if (followingRef.current) {
			followingRef.current = false
			setFollowing(false)
		}
		if (!playingRef.current) return
		setJumpVisible(true)
		window.clearTimeout(jumpTimer.current)
		jumpTimer.current = window.setTimeout(() => setJumpVisible(false), 3000)
	}, [])

	useEffect(() => {
		const element = scrollRef.current
		if (!element) return
		const onPointerDown = (event: PointerEvent) => {
			// Only the scrollbar targets the scroll container; a click on a line targets the line.
			if (event.target === element) releaseFollow()
		}
		// Keys land on the document until something inside the list has focus, so listen there.
		const onKeyDown = (event: KeyboardEvent) => {
			if (!SCROLL_KEYS.includes(event.key)) return
			const target = event.target as HTMLElement | null
			if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
			if (target && target !== document.body && !element.contains(target)) return
			releaseFollow()
		}
		element.addEventListener('wheel', releaseFollow, { passive: true })
		element.addEventListener('touchmove', releaseFollow, { passive: true })
		element.addEventListener('pointerdown', onPointerDown)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			element.removeEventListener('wheel', releaseFollow)
			element.removeEventListener('touchmove', releaseFollow)
			element.removeEventListener('pointerdown', onPointerDown)
			window.removeEventListener('keydown', onKeyDown)
		}
		// The summary tab renders no scroll container, so re-attach when the transcript comes back.
	}, [releaseFollow, tab])

	// Coming back to the tail re-arms the follow, the way a log view sticks to the bottom again.
	// Measured here rather than in a later frame: by then the streamed rows have already grown the
	// list out from under the reader, and a landing at the bottom would no longer look like one.
	const onScroll = useCallback(() => {
		const element = scrollRef.current
		if (!running || followingRef.current || !element) return
		if (element.scrollHeight - element.scrollTop - element.clientHeight > BOTTOM_STICK_PX) return
		followingRef.current = true
		setFollowing(true)
	}, [running])

	useEffect(() => () => window.clearTimeout(jumpTimer.current), [])

	const jumpToPlaying = useCallback(() => {
		setFollowing(true)
		followingRef.current = true
		setJumpVisible(false)
		window.clearTimeout(jumpTimer.current)
		const position = rowOf.get(activeId)
		if (position != null) rowVirtualizer.scrollToIndex(position, { align: 'center' })
	}, [activeId, rowVirtualizer, rowOf])

	const startEdit = useCallback(
		(id: number, caret: CaretIntent) => {
			setEditing({ id, caret })
			const position = rowOf.get(id)
			if (position != null) rowVirtualizer.scrollToIndex(position, { align: 'auto' })
		},
		[rowOf, rowVirtualizer],
	)
	const cancelEdit = useCallback(() => setEditing(null), [])

	/** Move the editor to the neighbouring visible sentence, so a transcript can be fixed without the mouse. */
	const moveEdit = useCallback(
		(id: number, direction: 1 | -1, caret: CaretIntent) => {
			const at = visibleSentences.findIndex((sentence) => sentence.id === id)
			const next = visibleSentences[at + direction]
			setEditing(next ? { id: next.id, caret } : null)
			const position = next ? rowOf.get(next.id) : undefined
			if (position != null) rowVirtualizer.scrollToIndex(position, { align: 'auto' })
		},
		[rowOf, rowVirtualizer, visibleSentences],
	)

	const commitEdit = useCallback(
		(sentence: Sentence, text: string, then?: 'next' | 'previous') => {
			queue.setSegments(job.id, replaceSentence(job.segments, sentence, text))
			if (then) moveEdit(sentence.id, then === 'next' ? 1 : -1, then === 'next' ? 'start' : 'end')
			else setEditing(null)
		},
		[job.id, job.segments, moveEdit, queue],
	)

	const renameSpeaker = useCallback((speaker: number, name: string) => queue.setSpeakerName(job.id, speaker, name), [job.id, queue])
	/** A row's speaker is the speaker of every stored line it draws from. */
	const assignSpeaker = useCallback(
		(row: Paragraph, speaker: number) => {
			const touched = new Set(segmentsOf(row))
			queue.setSegments(
				job.id,
				job.segments.map((segment, index) => (touched.has(index) && segment.speaker !== speaker ? { ...segment, speaker } : segment)),
			)
		},
		[job.id, job.segments, queue],
	)
	const speakers = useMemo(
		() => [...new Set(job.segments.flatMap((segment) => (segment.speaker != null ? [segment.speaker] : [])))].sort((a, b) => a - b),
		[job.segments],
	)

	const showJump = playing && jumpVisible && !following && activeId >= 0 && tab === 'transcript'
	const canTranscribeSaved =
		job.hydrated === true && ['done', 'error', 'cancelled'].includes(job.status) && job.segments.length === 0 && Boolean(job.savedPath && job.path)

	if (tab === 'summary') return <SummaryView job={job} options={options} />

	return (
		<div className="relative h-full min-h-0">
			<div ref={scrollRef} onScroll={onScroll} className="transcript-editor h-full min-h-0 overflow-x-hidden overflow-y-auto">
				<div dir={preference.textAreaDirection} className="mx-auto w-full max-w-[86ch] px-8 py-10 xl:max-w-[96ch]">
					<ProjectNameEditor
						name={job.name}
						disabled={job.status === 'queued' || job.status === 'running'}
						onDraftChange={(name) => queue.previewJobName(job.id, name)}
						onRename={(name) => queue.renameJob(job.id, name)}
					/>

					{job.status === 'error' && <p className="mb-8 text-sm text-destructive">{job.error}</p>}

					{canTranscribeSaved && !query ? (
						<div className="flex min-h-[46vh] items-center justify-center py-10">
							<div
								dir={interfaceDirection}
								className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border/60 bg-card/55 px-8 py-10 text-center shadow-xs">
								<div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
									<AudioLines className="h-5 w-5" />
								</div>
								<h2 className="text-base font-semibold text-foreground">{m.recordingReady()}</h2>
								<p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{m.recordingReadyInfo()}</p>
								<div className="mt-5">
									<QuietRow />
								</div>
								<Button type="button" className="mt-3 min-w-32" disabled={!preference.modelPath} onClick={() => queue.transcribeJob(job.id)}>
									<AudioLines className="h-4 w-4" />
									{m.transcribe()}
								</Button>
							</div>
						</div>
					) : visible.length === 0 && !query && isPreparing(job) ? (
						<PreparingState job={job} />
					) : visible.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{query ? m.noMatchingLines() : running ? m.transcriptWillDisplayedShortly() : job.status === 'queued' ? m.loading() : ''}
						</p>
					) : null}

					<div ref={listRef} className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
						{rowVirtualizer.getVirtualItems().map((virtualRow) => {
							const row = visible[virtualRow.index]
							const holds = (id: number) => id >= 0 && rowOf.get(id) === virtualRow.index
							return (
								<div
									key={virtualRow.key}
									ref={rowVirtualizer.measureElement}
									data-index={virtualRow.index}
									className={cn('absolute top-0 left-0 w-full', options.lines === 'paragraphs' && 'pb-2')}
									style={{ transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)` }}>
									<TranscriptRow
										row={row}
										query={query}
										animate={running}
										editable={editable}
										editing={editing && holds(editing.id) ? editing : null}
										activeId={holds(activeId) ? activeId : -1}
										options={options}
										speakerNames={job.speakerNames}
										speakers={speakers}
										onStartEdit={startEdit}
										onCancel={cancelEdit}
										onCommit={commitEdit}
										onMove={moveEdit}
										onRenameSpeaker={renameSpeaker}
										onAssignSpeaker={assignSpeaker}
									/>
								</div>
							)
						})}
					</div>

					{running && !isPreparing(job) && <div className={cn('mt-8 h-4 w-24 animate-pulse rounded-full bg-muted')} />}
				</div>
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
