import { motion } from 'framer-motion'
import { AlertCircle, Check, CircleSlash, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/style'
import type { Job } from '../hooks/use-transcribe-queue'
import { useSession } from '../session'

function StatusIcon({ job }: { job: Job }) {
	switch (job.status) {
		case 'running':
			return <Spinner className="h-3.5 w-3.5 text-foreground" />
		case 'done':
			return <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.4} />
		case 'error':
			return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
		case 'cancelled':
			return <CircleSlash className="h-3.5 w-3.5 text-muted-foreground" />
		default:
			return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
	}
}

function statusLabel(job: Job) {
	switch (job.status) {
		case 'running':
			return `${Math.round(job.progress)}%`
		case 'done':
			return job.seconds != null ? m.transcribeTook({ total: String(job.seconds) }) : m.transcribed()
		case 'error':
			return job.error ?? m.error()
		case 'cancelled':
			return m.cancel()
		default:
			return m.loading()
	}
}

export default function FileQueue() {
	const { queue } = useSession()

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
					{m.files()} · {queue.jobs.length}
				</p>
				{queue.running && (
					<button
						type="button"
						onClick={queue.cancelAll}
						disabled={queue.isAborting}
						className="cursor-pointer text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase transition-colors duration-150 hover:text-destructive disabled:opacity-50">
						{queue.isAborting ? m.aborting() : m.cancel()}
					</button>
				)}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{queue.jobs.map((job) => {
					const selected = job.id === queue.selectedId
					return (
						<button
							type="button"
							key={job.id}
							onClick={() => queue.selectJob(job.id)}
							className={cn(
								'group relative block w-full cursor-pointer rounded-xl px-3 py-2.5 text-start transition-colors duration-150',
								selected ? 'bg-muted' : 'hover:bg-muted/60',
							)}>
							<div className="flex items-center gap-2.5">
								<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
									<StatusIcon job={job} />
								</span>
								<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{job.name}</span>
								{job.status === 'running' && (
									<span
										role="button"
										tabIndex={0}
										onClick={(event) => {
											event.stopPropagation()
											queue.cancelCurrent()
										}}
										onKeyDown={(event) => {
											if (event.key === 'Enter') queue.cancelCurrent()
										}}
										className="cursor-pointer text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-destructive">
										<X className="h-3.5 w-3.5" />
									</span>
								)}
							</div>

							<p className={cn('mt-1 ps-6 truncate text-[11px]', job.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
								{statusLabel(job)}
							</p>

							{job.status === 'running' && (
								<div className="mt-2 ms-6 h-[3px] overflow-hidden rounded-full bg-muted-foreground/15">
									<motion.div
										className="aurora-bar h-full rounded-full bg-primary/70"
										initial={false}
										animate={{ width: `${Math.max(2, job.progress)}%` }}
										transition={{ duration: 0.2, ease: 'easeOut' }}
									/>
								</div>
							)}
						</button>
					)
				})}
			</div>
		</div>
	)
}
