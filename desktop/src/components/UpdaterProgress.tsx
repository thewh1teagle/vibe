import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UpdaterContext } from '~/providers/Updater'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Progress } from '~/components/ui/progress'

export default function UpdateProgress() {
	const { manifest, progress, updating } = useContext(UpdaterContext)
	const { t } = useTranslation()

	return (
		<Dialog open={updating}>
			<DialogContent onInteractOutside={(e) => e.preventDefault()}>
				<DialogHeader>
					<DialogTitle>{t('common.updating-modal-title')}</DialogTitle>
					<DialogDescription>{t('common.updating-modal-body', { version: manifest?.version })}</DialogDescription>
				</DialogHeader>
				<div className="flex justify-center">
					<Progress value={progress ?? 0} className="w-56" />
				</div>
			</DialogContent>
		</Dialog>
	)
}
