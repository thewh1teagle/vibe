import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { memo, useCallback } from 'react'
import { m } from '~/paraglide/messages.js'
import { cn } from '~/lib/style'
import { formatTimestamp, type SpeakerNames } from '~/lib/transcript'
import type { Paragraph, Sentence } from '~/lib/transcript-grouping'
import { textSizeClass, type TranscriptViewOptions } from '../hooks/use-transcript-view'
import { Highlight } from './highlight'
import { PLAYER_SEEK_EVENT } from './player-bar'
import { offsetFromPoint, SegmentEditor, selectionRangeIn, type CaretIntent } from './segment-editor'
import { SpeakerLabel } from './speaker-label'

/** Transcript timestamps are centiseconds (see `formatTimestamp` / `asJson` in lib/transcript). */
export const CENTISECONDS_PER_SECOND = 100

/** The sentence being edited, and where its editor should put the caret. */
export interface EditTarget {
	id: number
	caret: CaretIntent
}

function seekTo(centiseconds: number) {
	window.dispatchEvent(new CustomEvent(PLAYER_SEEK_EVENT, { detail: { seconds: centiseconds / CENTISECONDS_PER_SECOND } }))
}

interface TranscriptRowProps {
	/** One line of the view: an engine line, a sentence, or a paragraph of sentences. */
	row: Paragraph
	query: string
	animate: boolean
	editable: boolean
	/** Set while one of this row's sentences is being edited. */
	editing: EditTarget | null
	/** The sentence being spoken when it is in this row, else -1. */
	activeId: number
	options: TranscriptViewOptions
	speakerNames?: SpeakerNames
	/** Every speaker index the transcript knows, so a row can be moved to one of them. */
	speakers: number[]
	onStartEdit: (id: number, caret: CaretIntent) => void
	onCancel: () => void
	onCommit: (sentence: Sentence, text: string, then?: 'next' | 'previous') => void
	onMove: (id: number, direction: 1 | -1, caret: CaretIntent) => void
	onRenameSpeaker: (speaker: number, name: string) => void
	onAssignSpeaker: (row: Paragraph, speaker: number) => void
}

const TranscriptRow = memo(function TranscriptRow({
	row,
	query,
	animate,
	editable,
	editing,
	activeId,
	options,
	speakerNames,
	speakers,
	onStartEdit,
	onCancel,
	onCommit,
	onMove,
	onRenameSpeaker,
	onAssignSpeaker,
}: TranscriptRowProps) {
	const single = row.sentences.length === 1
	const active = activeId >= 0
	const isEditing = editing !== null
	const timestamp = formatTimestamp(row.start, false, '', false)

	const onSentenceClick = useCallback(
		(event: React.MouseEvent<HTMLSpanElement>, sentence: Sentence) => {
			// With a modifier the click plays from the sentence; a paragraph has one timestamp for many.
			if (event.altKey || event.metaKey || event.ctrlKey) {
				seekTo(sentence.start)
				return
			}
			if (!editable || isEditing) return
			const node = event.currentTarget
			// A drag-selection carries into the editor; a plain click drops the caret where it landed.
			const selected = selectionRangeIn(node)
			const at = selected ?? offsetFromPoint(node, event.clientX, event.clientY)
			onStartEdit(sentence.id, typeof at === 'number' ? { start: at, end: at } : (at ?? 'end'))
		},
		[editable, isEditing, onStartEdit],
	)

	return (
		<motion.div
			initial={animate ? { opacity: 0, y: 4 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.15, ease: 'easeOut' }}
			className={cn(
				'group relative -mx-3 flex gap-3 rounded-xl px-3 py-2 transition-colors duration-150',
				single && !active && editable && !isEditing && 'hover:bg-muted/40',
			)}>
			{/*
			 * The line being spoken gets a wash that fades out along the text instead of a block of
			 * colour with a hard edge — it reads as lighting rather than selection, and it can cross-fade.
			 * A paragraph lights only the sentence being spoken, further down.
			 */}
			<span
				aria-hidden
				className={cn(
					'pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-foreground/[0.07] via-foreground/[0.04] to-transparent transition-opacity duration-500 ease-out rtl:bg-gradient-to-l',
					active && single ? 'opacity-100' : 'opacity-0',
				)}
			/>

			{/* Gutter: the timestamp doubles as the play button, so playing a line is one click. */}
			<button
				type="button"
				onClick={() => seekTo(row.start)}
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
				{options.showSpeakers && (
					<SpeakerLabel
						speaker={row.speaker}
						speakers={speakers}
						speakerNames={speakerNames}
						editable={editable}
						onRename={onRenameSpeaker}
						onAssign={(speaker) => onAssignSpeaker(row, speaker)}
					/>
				)}

				<div className={cn('whitespace-pre-wrap text-foreground', textSizeClass[options.textSize])}>
					{row.sentences.map((sentence, position) =>
						editing?.id === sentence.id ? (
							<SegmentEditor
								key={sentence.id}
								initialText={sentence.text}
								caret={editing.caret}
								textSizeClassName={textSizeClass[options.textSize]}
								onCommit={(next, then) => onCommit(sentence, next, then)}
								onCancel={onCancel}
								onMove={(direction, caret) => onMove(sentence.id, direction, caret)}
							/>
						) : (
							<span key={sentence.id}>
								<span
									role={editable ? 'textbox' : undefined}
									tabIndex={editable ? 0 : undefined}
									title={single ? undefined : formatTimestamp(sentence.start, false, '', false)}
									onClick={(event) => onSentenceClick(event, sentence)}
									onKeyDown={(event) => {
										if (!editable || event.key !== 'Enter') return
										event.preventDefault()
										onStartEdit(sentence.id, 'end')
									}}
									className={cn(
										'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
										single ? 'block' : 'box-decoration-clone py-[2px] transition-colors duration-300',
										editable && 'cursor-text',
										!single && (sentence.id === activeId ? 'bg-foreground/[0.09]' : 'hover:bg-foreground/[0.05]'),
									)}>
									<Highlight text={sentence.text} query={query} />
								</span>
								{position < row.sentences.length - 1 && ' '}
							</span>
						),
					)}
				</div>
			</div>
		</motion.div>
	)
})

export default TranscriptRow
