import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useSession } from '../session'
import FileQueue from './file-queue'
import TranscriptToolbar from './transcript-toolbar'
import TranscriptView from './transcript-view'

export default function SessionView() {
	const { queue } = useSession()
	const [query, setQuery] = useState('')
	const multiple = queue.jobs.length > 1
	const selected = queue.selectedJob

	useEffect(() => {
		setQuery('')
	}, [queue.selectedId])

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
				<TranscriptToolbar job={selected} query={query} setQuery={setQuery} />
				<div className="min-h-0 flex-1">{selected && <TranscriptView job={selected} query={query} />}</div>
			</div>
		</motion.div>
	)
}
