import { m } from '~/paraglide/messages.js'
import { ReactComponent as IndicatorIcon } from '~/icons/update-indicator.svg'
import { RefreshCcw, Settings } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

interface AppMenuProps {
	availableUpdate: boolean
	updateApp: () => void
	onClickSettings: (scrollTo?: string) => void
}

const iconButtonClassName = 'h-9 w-9 rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground [&_svg]:size-[18px]'

export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	return (
		<div dir="ltr" className="flex items-center gap-1">
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
