import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '~/lib/utils'
import { UpdaterContext } from '~/providers/Updater'

export default function UpdateProgress() {
	const { manifest, progress, updating } = useContext(UpdaterContext)
	const { t } = useTranslation()

	return (
		<dialog className={cx('modal text-center', updating && 'modal-open')}>
			<div className="modal-box">
				<h3 className="font-bold text-lg">{t('common.updating-modal-title')}</h3>
				<p className="py-4">{t('common.updating-modal-body', { version: manifest?.version })}</p>
				<div className="flex justify-center">
					<progress className="progress w-56 progress-primary" value={progress ?? 0} max={100}></progress>
				</div>
			</div>
		</dialog>
	)
}
