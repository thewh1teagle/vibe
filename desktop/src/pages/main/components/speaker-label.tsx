import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Input } from '~/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { speakerName, type SpeakerNames } from '~/lib/transcript'
import { cn } from '~/lib/style'

interface SpeakerLabelProps {
	/** This line's speaker; undefined when diarization left the line unattributed. */
	speaker?: number
	/** Every speaker index the transcript knows, in order. */
	speakers: number[]
	speakerNames?: SpeakerNames
	/** A finished transcript can be edited; a running one only shows the label. */
	editable: boolean
	onRename: (speaker: number, name: string) => void
	/** Move this line to another speaker, or to a brand-new one past the last index. */
	onAssign: (speaker: number) => void
}

const chipClass = 'me-2 align-baseline text-[11px] font-semibold text-muted-foreground'
const interactiveChipClass =
	'-mx-1 cursor-pointer rounded-md px-1 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80'

/**
 * The "Speaker N" tag in front of a line. Clicking it opens a small editor: the name typed there
 * replaces the tag on every line of that speaker, and clearing it brings the default back. The
 * same popover moves just this line to another speaker. A line diarization missed gets a dashed
 * placeholder instead, so it can be given a speaker too.
 */
export function SpeakerLabel({ speaker, speakers, speakerNames, editable, onRename, onAssign }: SpeakerLabelProps) {
	const label = m.speakerPrefix()
	const current = speaker != null ? speakerNames?.[speaker] : undefined
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState(current ?? '')
	// Escape throws the draft away; every other way of closing (Enter, clicking elsewhere) keeps it.
	const cancelledRef = useRef(false)

	useEffect(() => {
		if (open) setDraft(current ?? '')
	}, [current, open])

	if (speaker == null && (!editable || speakers.length === 0)) return null
	if (speaker != null && !editable) return <span className={chipClass}>{speakerName(speaker, label, speakerNames)}</span>

	function saveName() {
		if (speaker != null) onRename(speaker, draft)
	}

	function handleOpenChange(next: boolean) {
		if (!next && !cancelledRef.current) saveName()
		cancelledRef.current = false
		setOpen(next)
	}

	function assign(target: number) {
		// The name edit still lands, then the line moves; the popover closes without saving twice.
		cancelledRef.current = true
		saveName()
		setOpen(false)
		if (target !== speaker) onAssign(target)
	}

	const nextSpeaker = speakers.length ? Math.max(...speakers) + 1 : 0

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				{speaker != null ? (
					<button type="button" title={m.renameSpeaker()} className={cn(chipClass, interactiveChipClass)}>
						{speakerName(speaker, label, speakerNames)}
					</button>
				) : (
					<button
						type="button"
						title={m.assignSpeaker()}
						className={cn(
							chipClass,
							interactiveChipClass,
							'inline-flex items-center gap-0.5 border border-dashed border-border text-muted-foreground/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
						)}>
						<Plus className="h-3 w-3" />
						{label}
					</button>
				)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 rounded-2xl p-3">
				{speaker != null && (
					<form
						className="mb-3"
						onSubmit={(event) => {
							event.preventDefault()
							saveName()
							setOpen(false)
						}}>
						<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.renameSpeaker()}</p>
						<Input
							autoFocus
							value={draft}
							onChange={(event) => setDraft(event.target.value.slice(0, 64))}
							onKeyDown={(event) => {
								// Radix closes the popover on Escape; mark it so the close does not save the draft.
								if (event.key === 'Escape') cancelledRef.current = true
							}}
							placeholder={`${label} ${speaker + 1}`}
							className="h-9"
						/>
					</form>
				)}
				<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.speakerOfThisLine()}</p>
				<div className="flex flex-wrap gap-1.5">
					{speakers.map((candidate) => (
						<button
							key={candidate}
							type="button"
							aria-pressed={candidate === speaker}
							onClick={() => assign(candidate)}
							className={cn(
								'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
								candidate === speaker
									? 'border-foreground/20 bg-foreground text-background'
									: 'border-border bg-muted/50 text-muted-foreground hover:text-foreground',
							)}>
							{speakerName(candidate, label, speakerNames)}
						</button>
					))}
					<button
						type="button"
						onClick={() => assign(nextSpeaker)}
						className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
						<Plus className="h-3 w-3" />
						{m.newSpeaker()}
					</button>
				</div>
			</PopoverContent>
		</Popover>
	)
}
