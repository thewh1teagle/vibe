import { useContext } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { reminderBanner } from '~/lib/updater'
import { UpdaterContext } from '~/providers/updater'

/**
 * The reminder for an update that is still waiting. A slim in-window bar, never a popup or
 * a system notification: it takes no focus and blocks nothing. Rust decides when `remind` is on.
 */
export default function UpdateBanner() {
	const { state, installNow, remindLater } = useContext(UpdaterContext)
	const banner = reminderBanner(state)
	if (!banner) return null

	const ready = banner.kind === 'ready'
	return (
		<div role="status" className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-[13px]">
			<span className="min-w-0 flex-1 text-foreground">
				{ready ? m.updateReadyBanner({ version: banner.version }) : m.updateAvailableBanner({ version: banner.version })}
			</span>
			<div className="flex shrink-0 items-center gap-1.5">
				<Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px]" onClick={() => void remindLater()}>
					{m.cancelUpdate()}
				</Button>
				<Button size="sm" className="h-7 px-2.5 text-[13px]" onClick={() => void installNow()}>
					{ready ? m.restartToUpdate() : m.updateVersion()}
				</Button>
			</div>
		</div>
	)
}
