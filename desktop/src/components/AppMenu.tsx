import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ReactComponent as EllipsisIcon } from '~/icons/ellipsis.svg'
import { ReactComponent as IndicatorIcon } from '~/icons/update-indicator.svg'
import { Button } from '~/components/ui/button'

interface AppMenuProps {
	availableUpdate: boolean
	updateApp: () => void
	onClickSettings: () => void
}

export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)

	return (
		<div className="absolute left-0 top-0" dir="ltr" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
			<Button variant="ghost" size="icon" className="relative h-10 w-10" onMouseDown={() => setOpen(!open)}>
				<EllipsisIcon className="h-5 w-5" />
				{availableUpdate && <IndicatorIcon className="w-2 h-2 absolute -top-0.5 left-4" />}
			</Button>

			{open && (
				<div className="absolute top-full left-0 z-50 min-w-[12rem] rounded-lg bg-popover p-1 shadow-lg">
					<button
						onMouseDown={onClickSettings}
						className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
						{t('common.settings')}
					</button>
					<button
						onMouseDown={() => navigate(-1)}
						className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
						{t('common.back')}
					</button>
					{availableUpdate && (
						<button
							onMouseDown={updateApp}
							className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
							{t('common.update-version')}
						</button>
					)}
				</div>
			)}
		</div>
	)
}
