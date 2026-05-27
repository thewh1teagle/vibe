import { ReactComponent as InfoIcon } from '~/icons/info.svg'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

export function InfoTooltip({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span tabIndex={0} role="button" aria-label="More info">
					<InfoIcon className="w-5 h-5" />
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">{text}</TooltipContent>
		</Tooltip>
	)
}
