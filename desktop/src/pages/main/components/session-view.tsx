import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useSession } from '../session'
import { useTranscriptViewOptions, type TranscriptTab } from '../hooks/use-transcript-view'
import FileQueue from './file-queue'
import TranscriptToolbar from './transcript-toolbar'
import TranscriptView from './transcript-view'

export default function SessionView() {
	const { queue, summaries } = useSession()
	const [query, setQuery] = useState('')
	const [tab, setTab] = useState<TranscriptTab>('transcript')
	const options = useTranscriptViewOptions()
	const multiple = queue.jobs.length > 1
	const selected = queue.selectedJob

	useEffect(() => {
		setQuery('')
		setTab('transcript')
	}, [queue.selectedId])

	// A summary that arrived on its own opens itself once — that is what the settings switch promises.
	useEffect(() => {
		if (!summaries.autoSummarized) return
		if (summaries.autoSummarized === queue.selectedId) setTab('summary')
		summaries.clearAutoSummarized()
	}, [queue.selectedId, summaries])

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: 'easeOut' }}
			className="flex min-h-0 flex-1">
			{multiple && (
				<aside className="hidden w-[264px] shrink-0 border-e border-border md:block">
					<FileQueue />
				</aside>
			)}

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<TranscriptToolbar job={selected} query={query} setQuery={setQuery} options={options} tab={tab} setTab={setTab} />
				<div className="min-h-0 flex-1">{selected && <TranscriptView job={selected} query={query} options={options} tab={tab} />}</div>
			</div>
		</motion.div>
	)
}
