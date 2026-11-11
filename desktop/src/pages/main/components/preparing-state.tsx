import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection } from '~/paraglide/runtime.js'
import type { Job } from '../hooks/use-transcribe-queue'

/** How long a job waits before the note about long recordings appears; short files never see it. */
const HINT_DELAY_MS = 6000

/**
 * A running job that has shown nothing yet. The steps before the first word (decoding the audio,
 * telling the speakers apart, finding speech) report no percentage, and on a long recording they
 * take minutes, so a "0%" here reads as a hang.
 */
export function isPreparing(job: Job) {
	return job.status === 'running' && job.progress <= 0 && job.segments.length === 0
}

/** What the engine is doing right now, in the user's words. */
export function stageLabel(job: Job) {
	switch (job.stage) {
		case 'speakers':
			return m.stageRecognizingSpeakers()
		case 'transcribing':
			return m.stageStartingTranscription()
		default:
			return m.stagePreparingAudio()
	}
}

/** The transcript's place while a job prepares: the current step, and the shape of the lines to come. */
export default function PreparingState({ job }: { job: Job }) {
	const label = stageLabel(job)
	const [showHint, setShowHint] = useState(false)
	// These are interface strings: in a transcript column laid out for another script, their own
	// direction keeps the trailing dots at the end of the sentence.
	const dir = getTextDirection(getLocale())

	useEffect(() => {
		setShowHint(false)
		const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS)
		return () => clearTimeout(timer)
	}, [job.id])

	return (
		<div className="w-full" role="status" aria-live="polite">
			<div className="flex items-center gap-2.5">
				<span className="aurora-orb h-3.5 w-3.5 shrink-0 rounded-full" aria-hidden />
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={label}
						dir={dir}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.22, ease: 'easeOut' }}
						className="shimmer-text text-sm font-medium">
						{label}
					</motion.span>
				</AnimatePresence>
			</div>

			<div className="mt-5 space-y-3" aria-hidden>
				<div className="aurora-sheen h-3 w-[92%] rounded-full" />
				<div className="aurora-sheen h-3 w-[78%] rounded-full [animation-delay:160ms]" />
				<div className="aurora-sheen h-3 w-[54%] rounded-full [animation-delay:320ms]" />
			</div>

			<AnimatePresence>
				{showHint && (
					<motion.p
						dir={dir}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.5 }}
						className="mt-5 max-w-md text-[13px] leading-5 text-muted-foreground">
						{m.stageLongRecordingHint()}
					</motion.p>
				)}
			</AnimatePresence>
		</div>
	)
}
