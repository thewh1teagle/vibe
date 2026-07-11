import { useContext } from 'react'
import { m } from '~/paraglide/messages.js'
import { UpdaterContext } from '~/providers/updater'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Progress } from '~/components/ui/progress'

export default function UpdateProgress() {
	const { manifest, progress, updating } = useContext(UpdaterContext)

	return (
		<Dialog open={updating}>
			<DialogContent onInteractOutside={(e) => e.preventDefault()}>
				<DialogHeader>
					<DialogTitle>{m.updatingModalTitle()}</DialogTitle>
				<DialogDescription>{m.updatingModalBody({ version: String(manifest?.version ?? '') })}</DialogDescription>
				</DialogHeader>
				<div className="flex justify-center">
					<Progress value={progress ?? 0} className="w-56" />
				</div>
			</DialogContent>
		</Dialog>
	)
}
