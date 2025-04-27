import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ReactComponent as EllipsisIcon } from '~/icons/ellipsis.svg'
import { ReactComponent as IndicatorIcon } from '~/icons/update-indicator.svg'
import { cx } from '~/lib/utils'

interface AppMenuProps {
	availableUpdate: boolean
	updateApp: () => void
	onClickSettings: () => void
}

export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const navigate = useNavigate()

	return (
		<div
			onMouseEnter={() => {
				if (!open) {
					setOpen(true)
				}
			}}
			onMouseLeave={() => {
				if (open) {
					setOpen(false)
				}
			}}
			onMouseDown={() => setOpen(!open)}
			className={cx('dropdown absolute left-0 top-0', open && 'dropdown-open')}
			dir="ltr">
			<EllipsisIcon />
			{availableUpdate && <IndicatorIcon className="w-2 h-2 absolute -top-0.5 left-3" />}
			<div tabIndex={0} className="dropdown-content -translate-x-0.5 -translate-y-1.5 z-[1] menu p-1.5 bg-base-300 rounded-box w-52">
				<li onMouseDown={() => onClickSettings()}>
					<a>{t('common.settings')}</a>
				</li>
				<li onMouseDown={() => navigate(-1)}>
					<a>{t('common.back')}</a>
				</li>
				{availableUpdate && (
					<li onMouseDown={() => updateApp()}>
						<a className="bg-primary">{t('common.update-version')}</a>
					</li>
				)}
			</div>
		</div>
	)
}
