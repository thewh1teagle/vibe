import { Button } from '~/components/ui/button'
import { openSettingsSection } from '~/lib/app'

export default function AdvancedOptionsButton() {

	return (
		<Button
			variant="ghost"
			onMouseDown={() => openSettingsSection('tuning')}
			className="mt-1 h-9 rounded-md border border-border/65 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/45 hover:text-foreground">
			Advanced Options
		</Button>
	)
}
