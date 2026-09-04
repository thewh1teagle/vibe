import { Check, FolderOpen, X } from 'lucide-react'
import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { openPath } from '~/lib/app'
import { useSession } from '../session'

/**
 * What a batch user watches: progress across the run while it goes, and, when the last
 * file completes, one card with the counts and a way to the files. Neither shows for a
 * single file, and the card stays until dismissed so a result seen hours later is still
 * there.
 */
export default function BatchBanner() {
	const { queue } = useSession()
	const [details, setDetails] = useState(false)
	const { batch, batchSummary } = queue

	if (batch) {
		const remaining = batch.total - batch.done
		const minutes = batch.secondsPerFile != null ? Math.max(1, Math.round((remaining * batch.secondsPerFile) / 60)) : null
		return (
			<div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[12px]">
				<span className="font-medium text-foreground">{m.batchLabel()}</span>
				<div className="h-1 flex-1 overflow-hidden rounded-full bg-muted-foreground/15">
					<div
						className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
						style={{ width: `${Math.max(2, (batch.done / batch.total) * 100)}%` }}
					/>
				</div>
				<span className="text-muted-foreground tabular-nums">
					{m.batchProgress({ done: String(batch.done), total: String(batch.total) })}
					{minutes != null && ` · ${m.batchTimeLeft({ minutes: String(minutes) })}`}
				</span>
			</div>
		)
	}

	if (!batchSummary) return null
	const summary = batchSummary
	const minutes = Math.max(1, Math.round(summary.seconds / 60))
	const exportedAny = summary.exported + summary.skipped + summary.fallback + summary.failed > 0

	return (
		<div className="mx-4 mt-3 rounded-xl border border-border bg-muted/50 px-3.5 py-3 text-[12px]">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
					<Check className="h-3 w-3" strokeWidth={2.6} />
				</span>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground">{m.batchFinishedHeadline({ total: String(summary.total), minutes: String(minutes) })}</p>
					<p className="mt-0.5 text-muted-foreground">
						{exportedAny
							? [
									m.batchCountExported({ count: String(summary.exported) }),
									summary.skipped > 0 && m.batchCountSkipped({ count: String(summary.skipped) }),
									summary.fallback > 0 && m.batchCountFallback({ count: String(summary.fallback) }),
									summary.failed > 0 && m.batchCountFailed({ count: String(summary.failed) }),
								]
									.filter(Boolean)
									.join(', ')
							: m.batchFinishedFiles({ count: String(summary.total) })}
						{summary.exceptions.length > 0 && (
							<>
								{' · '}
								<button
									type="button"
									onClick={() => setDetails((value) => !value)}
									className="cursor-pointer text-primary underline-offset-4 hover:underline">
									{details ? m.batchHideDetails() : m.batchShowDetails()}
								</button>
							</>
						)}
					</p>
					{details && (
						<ul className="mt-2 space-y-1 text-muted-foreground">
							{summary.exceptions.map((item) => (
								<li key={item.name} className="truncate">
									<span className="text-foreground">{item.name}</span> · {item.detail}
								</li>
							))}
						</ul>
					)}
				</div>
				{summary.folder && (
					<Button size="sm" className="rounded-full" onClick={() => void openPath({ name: '', path: summary.folder! })}>
						<FolderOpen className="h-3.5 w-3.5" />
						{m.openFolder()}
					</Button>
				)}
				<button
					type="button"
					onClick={queue.dismissBatchSummary}
					aria-label={m.dismiss()}
					className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground">
					<X className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	)
}
