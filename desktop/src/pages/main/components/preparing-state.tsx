import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection } from '~/paraglide/runtime.js'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job, JobStage } from '../hooks/use-transcribe-queue'

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

const STAGE_LABELS: Record<JobStage, () => string> = {
	preparing: () => m.stagePreparingAudio(),
	speakers: () => m.stageRecognizingSpeakers(),
	transcribing: () => m.stageStartingTranscription(),
}

/** A step that is not happening right now reads as a name, without the trailing dots of the running one. */
function restingLabel(label: string) {
	return label.replace(/[.…。\s]+$/u, '')
}

/** The transcript's place while a job prepares: every step on the way to the first line, and the shape of the lines to come. */
export default function PreparingState({ job }: { job: Job }) {
	const preference = usePreferenceProvider()
	const current: JobStage = job.stage ?? 'preparing'
	// Telling speakers apart only happens when it is switched on; the list shows the steps this run will take.
	const [sawSpeakers, setSawSpeakers] = useState(false)
	useEffect(() => setSawSpeakers(false), [job.id])
	useEffect(() => {
		if (current === 'speakers') setSawSpeakers(true)
	}, [current])
	const withSpeakers = preference.diarizeEnabled || sawSpeakers || current === 'speakers'
	const stages: JobStage[] = withSpeakers ? ['preparing', 'speakers', 'transcribing'] : ['preparing', 'transcribing']
	const at = stages.indexOf(current)
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
			<ol className="space-y-2.5">
				{stages.map((stage, position) => {
					const label = STAGE_LABELS[stage]()
					const done = position < at
					const running = position === at
					return (
						<li key={stage} aria-current={running ? 'step' : undefined} className="flex items-center gap-2.5">
							<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
								<AnimatePresence mode="wait" initial={false}>
									<motion.span
										key={done ? 'done' : running ? 'running' : 'waiting'}
										initial={{ opacity: 0, scale: 0.6 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.6 }}
										transition={{ duration: 0.18, ease: 'easeOut' }}
										className="flex items-center justify-center">
										{done ? (
											<Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
										) : running ? (
											<span className="aurora-orb block h-3.5 w-3.5 rounded-full" />
										) : (
											<span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/35" />
										)}
									</motion.span>
								</AnimatePresence>
							</span>
							<span
								dir={dir}
								className={cn(
									'text-sm transition-colors duration-300',
									running ? 'shimmer-text font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/55',
								)}>
								{running ? label : restingLabel(label)}
							</span>
						</li>
					)
				})}
			</ol>

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
