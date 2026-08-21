import { m } from '~/paraglide/messages.js'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactComponent as IndicatorIcon } from '~/icons/update-indicator.svg'
import { ArrowLeft, Plus, RefreshCcw, Settings } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

interface AppMenuProps {
	availableUpdate: boolean
	updateApp: () => void
	onClickSettings: (scrollTo?: string) => void
}

const iconButtonClassName = 'h-9 w-9 rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground [&_svg]:size-[18px]'

export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const disableBack = Boolean((location.state as { disableBack?: boolean } | null)?.disableBack)
	const canGoBack = location.key !== 'default' && !disableBack

	return (
		<div dir="ltr" className="flex items-center gap-1">
			{canGoBack && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" className={iconButtonClassName} aria-label={m.back()} onClick={() => navigate(-1)}>
							<ArrowLeft strokeWidth={1.75} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.back()}</TooltipContent>
				</Tooltip>
			)}

			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon" className={iconButtonClassName} aria-label="New" onClick={() => navigate('/')}>
						<Plus strokeWidth={1.75} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>New</TooltipContent>
			</Tooltip>

			{availableUpdate && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" className={`${iconButtonClassName} relative`} aria-label={m.updateVersion()} onClick={updateApp}>
							<RefreshCcw strokeWidth={1.75} />
							<IndicatorIcon className="absolute right-1.5 top-1.5 h-2 w-2" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.updateVersion()}</TooltipContent>
				</Tooltip>
			)}

			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon" className={iconButtonClassName} aria-label={m.settings()} onClick={() => onClickSettings()}>
						<Settings strokeWidth={1.75} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>{m.settings()}</TooltipContent>
			</Tooltip>
		</div>
	)
}
