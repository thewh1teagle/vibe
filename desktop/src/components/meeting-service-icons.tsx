import { ReactComponent as GoogleMeetMark } from '~/icons/google-meet.svg'
import { ReactComponent as MicrosoftTeamsMark } from '~/icons/microsoft-teams.svg'
import { ReactComponent as ZoomMark } from '~/icons/zoom.svg'
import { cn } from '~/lib/style'

type IconProps = { className?: string }

export function GoogleMeetIcon({ className }: IconProps) {
	return <GoogleMeetMark aria-hidden="true" className={className} />
}

export function ZoomIcon({ className }: IconProps) {
	return <ZoomMark aria-hidden="true" className={className} />
}

export function MicrosoftTeamsIcon({ className }: IconProps) {
	return <MicrosoftTeamsMark aria-hidden="true" className={className} />
}

export function MeetingServiceIcons({ className, label }: IconProps & { label?: string }) {
	return (
		<div className={cn('flex flex-wrap items-center gap-2', className)} aria-label={label}>
			{[
				{ name: 'Google Meet', Icon: GoogleMeetIcon },
				{ name: 'Zoom', Icon: ZoomIcon },
				{ name: 'Microsoft Teams', Icon: MicrosoftTeamsIcon },
			].map(({ name, Icon }) => (
				<span
					key={name}
					className="flex items-center gap-1.5 rounded-lg border border-border/55 bg-background/55 px-2 py-1.5 text-xs text-muted-foreground">
					<Icon className="h-5 w-5 shrink-0" />
					<span>{name}</span>
				</span>
			))}
		</div>
	)
}
