import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import { m } from '~/paraglide/messages.js'
import HTMLView from '~/components/html-view'
import { formatTimestamp, type Segment } from '~/lib/transcript'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job } from '../hooks/use-transcribe-queue'

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

export default function TranscriptView({ job, query }: { job: Job; query: string }) {
	const preference = usePreferenceProvider()
	const scrollRef = useRef<HTMLDivElement>(null)
	const running = job.status === 'running'

	const segments: Segment[] = useMemo(() => {
		if (!query) return job.segments
		return job.segments.filter((segment) => segment.text.toLowerCase().includes(query.toLowerCase()))
	}, [job.segments, query])

	useEffect(() => {
		if (!running) return
		const node = scrollRef.current
		if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
	}, [job.segments.length, running])

	return (
		<div ref={scrollRef} className="h-full min-h-0 overflow-y-auto">
			<div dir={preference.textAreaDirection} className="mx-auto w-full max-w-[68ch] px-8 py-10">
				<p className="mb-8 truncate text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{job.name}</p>

				{job.status === 'error' && <p className="mb-8 text-sm text-destructive">{job.error}</p>}

				{segments.length === 0 && (
					<p className="text-sm text-muted-foreground">
						{query ? 'No matching lines.' : running ? m.transcriptWillDisplayedShortly() : job.status === 'queued' ? m.loading() : ''}
					</p>
				)}

				<div className="space-y-6">
					{segments.map((segment, index) => (
						<motion.p
							key={`${segment.start}-${index}`}
							initial={running ? { opacity: 0, y: 4 } : false}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.15, ease: 'easeOut' }}
							className="text-[15px] leading-[1.75] text-foreground">
							<span className="me-3 font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums select-none">
								{formatTimestamp(segment.start, false, '', false)}
							</span>
							{segment.speaker != null && (
								<span className="me-2 text-[11px] font-semibold text-muted-foreground">
									{m.speakerPrefix()} {segment.speaker + 1}
								</span>
							)}
							<Highlight text={segment.text.trim()} query={query} />
						</motion.p>
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
