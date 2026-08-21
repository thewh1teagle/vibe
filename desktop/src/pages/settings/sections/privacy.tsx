import { openUrl } from '@tauri-apps/plugin-opener'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { Switch } from '~/components/ui/switch'
import { ActionRow, SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

export function PrivacySection({ vm }: { vm: SettingsViewModel }) {
	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow
					label={m.analyticsEnabled()}
					description={!vm.preference.analyticsEnabled ? m.analyticsDisabledWarning() : undefined}
					clampDescription={false}>
					<Switch checked={vm.preference.analyticsEnabled} onCheckedChange={vm.preference.setAnalyticsEnabled} />
				</SettingsRow>
				<SettingsRow label="Save transcripts to Documents" description="Keep a local copy of every transcript so you can reopen it later">
					<Switch checked={vm.preference.saveTranscripts} onCheckedChange={vm.preference.setSaveTranscripts} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup>
				<ActionRow label={m.privacyPolicy()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.privacyPolicyURL)} />
			</SettingsGroup>
		</div>
	)
}
