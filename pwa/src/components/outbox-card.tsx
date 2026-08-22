import { AlertTriangle, Clock, Send, Trash2 } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { formatSize } from '~/lib/recorder'
import type { OutboxSummary } from '~/lib/outbox'

interface Props {
	entries: OutboxSummary[]
	activeId: string | null
	busy: boolean
	persisted: boolean
	onSendNow: () => void
	onDelete: (id: string) => void
}

/** "3 minutes ago" in the browser's locale, without pulling in a date library. */
function relativeTime(timestamp: number): string {
	const seconds = Math.round((timestamp - Date.now()) / 1000)
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		['second', 60],
		['minute', 60],
		['hour', 24],
		['day', 7],
	]
	let value = seconds
	for (const [unit, size] of units) {
		if (Math.abs(value) < size) {
			try {
				return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), unit)
			} catch {
				return `${Math.abs(Math.round(value))} ${unit}s ago`
			}
		}
		value /= size
	}
	return new Date(timestamp).toLocaleDateString()
}

/**
 * The queue is stated plainly. A silent outbox is worse than none: the user
 * cannot tell whether the recording they just made is safe.
 */
export function OutboxCard({ entries, activeId, busy, persisted, onSendNow, onDelete }: Props) {
	if (entries.length === 0) return null

	const waiting = entries.length

	return (
		<Card className="stagger-in mb-4 border-primary/30">
			<CardContent className="space-y-3 pt-6">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold">
							{waiting === 1 ? '1 recording waiting to send' : `${waiting} recordings waiting to send`}
						</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Saved on this phone. They stay here until your desktop confirms it has them.
						</p>
					</div>
					{busy && <Spinner className="mt-1 size-4 shrink-0" />}
				</div>

				{!persisted && (
					<div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
						<AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
						<p className="text-xs">
							This browser has not granted permanent storage, so it may clear these recordings if space runs low. Add the app to
							your home screen, or send them soon.
						</p>
					</div>
				)}

				<ul className="divide-y divide-border">
					{entries.map((entry) => {
						const sending = entry.id === activeId && busy
						return (
							<li key={entry.id} className="flex items-center gap-3 py-2.5">
								<Clock className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">{relativeTime(entry.createdAt)}</p>
									<p className="truncate text-xs text-muted-foreground">
										{formatSize(entry.size)}
										{entry.lang ? ` · ${entry.lang}` : ''}
										{entry.attempts > 0 ? ` · ${entry.attempts} ${entry.attempts === 1 ? 'try' : 'tries'}` : ''}
										{sending ? ' · sending…' : ''}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Delete recording"
									disabled={sending}
									onClick={() => onDelete(entry.id)}>
									<Trash2 />
								</Button>
							</li>
						)
					})}
				</ul>

				<Button className="h-12 w-full" disabled={busy} onClick={onSendNow}>
					<Send />
					{busy ? 'Sending…' : 'Send now'}
				</Button>
			</CardContent>
		</Card>
	)
}
