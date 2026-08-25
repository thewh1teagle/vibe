import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/style'
import type { PlaybackRate } from '~/lib/playback-rate'
import { m } from '~/paraglide/messages.js'

export function PlaybackRateButton({ playbackRate, onCycle }: { playbackRate: PlaybackRate; onCycle: () => void }) {
	const displayRate = `${playbackRate}×`
	const label = m.playbackRateControl({ rate: displayRate })

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onCycle}
					aria-label={label}
					className={cn(
						'h-7 w-11 shrink-0 rounded-full px-0 font-mono text-[11px] font-semibold tabular-nums',
						playbackRate === 1
							? 'text-muted-foreground hover:text-foreground'
							: 'bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary',
					)}>
					{displayRate}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}
