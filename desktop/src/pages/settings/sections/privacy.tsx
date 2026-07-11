import { openUrl } from '@tauri-apps/plugin-opener'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { SectionCard, type SettingsViewModel } from './shared'

export function PrivacySection({ vm }: { vm: SettingsViewModel }) {
	return (
		<div className="space-y-5">
			<SectionCard>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium">{m.analyticsEnabled()}</span>
					<Switch checked={vm.preference.analyticsEnabled} onCheckedChange={vm.preference.setAnalyticsEnabled} />
				</div>
				{!vm.preference.analyticsEnabled && <p className="mt-2 text-xs italic text-muted-foreground">{m.analyticsDisabledWarning()}</p>}
			</SectionCard>
			<Button variant="ghost" onMouseDown={() => openUrl(config.privacyPolicyURL)} className="h-11 w-full justify-between rounded-xl border border-border/55 bg-card/92 px-4 font-medium hover:bg-accent/55">
				{m.privacyPolicy()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
			</Button>
		</div>
	)
}
