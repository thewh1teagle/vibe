import { useContext } from 'react'
import { m } from '~/paraglide/messages.js'
import { showsUpdateProgress, updateProgressValue } from '~/lib/updater'
import { UpdaterContext } from '~/providers/updater'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Progress } from '~/components/ui/progress'

/**
 * Only for an install the user asked for (or one Rust starts at launch with an update already
 * downloaded): a background download must not put up a dialog. It cannot be dismissed — the app
 * relaunches when it is done.
 */
export default function UpdateProgress() {
	const { state } = useContext(UpdaterContext)
	const version = state.version ?? ''
	const installing = state.phase !== 'downloading'

	return (
		<Dialog open={showsUpdateProgress(state)}>
			<DialogContent
				// The built-in close button is the content's last child; there is nothing to close here.
				className="[&>button:last-child]:hidden"
				onInteractOutside={(e) => e.preventDefault()}
				onEscapeKeyDown={(e) => e.preventDefault()}
				{...(installing ? { 'aria-describedby': undefined } : {})}>
				<DialogHeader>
					<DialogTitle>{installing ? m.updatingTo({ version }) : m.updatingModalTitle()}</DialogTitle>
					{!installing && <DialogDescription>{m.updatingModalBody({ version })}</DialogDescription>}
				</DialogHeader>
				<div className="flex justify-center">
					<Progress
						value={updateProgressValue(state)}
						className={`progress-aurora h-1.5 w-56 bg-muted [&>*]:duration-500 [&>*]:ease-linear ${installing ? 'motion-safe:animate-pulse' : ''}`}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
