import { openUrl } from '@tauri-apps/plugin-opener'
import { Bot } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { Switch } from '~/components/ui/switch'
import { ActionRow, SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

export function ApiSection({ vm }: { vm: SettingsViewModel }) {
	const apiDocsUrl = vm.apiBaseUrl ? `${vm.apiBaseUrl}/docs` : null
	const serverActionBusy = vm.isStartingApiServer || vm.isStoppingApiServer
	const statusDescription = vm.isStartingApiServer ? m.apiStarting() : vm.isStoppingApiServer ? m.apiStopping() : (vm.apiBaseUrl ?? undefined)

	return (
		<div className="space-y-6">
			<SettingsGroup description={m.apiAgentsDescription()}>
				<SettingsRow label={vm.apiBaseUrl ? m.apiServerRunning() : m.apiServerOff()} description={statusDescription}>
					<Switch
						checked={Boolean(vm.apiBaseUrl)}
						disabled={serverActionBusy}
						onCheckedChange={(checked) => (checked ? vm.startApiServer() : vm.stopApiServer())}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup className={!vm.apiBaseUrl ? 'pointer-events-none opacity-50' : undefined}>
				<ActionRow
					label={m.swaggerDocs()}
					icon={<LinkIcon className="h-4 w-4" />}
					disabled={!apiDocsUrl}
					onClick={() => (apiDocsUrl ? openUrl(apiDocsUrl) : null)}
				/>
				<ActionRow label={m.copyCurlExample()} icon={<CopyIcon className="h-4 w-4" />} disabled={!vm.apiBaseUrl} onClick={vm.copyCurlExample} />
				<ActionRow label={m.copyAgentSkill()} icon={<Bot className="h-4 w-4" />} disabled={!vm.apiBaseUrl} onClick={vm.copyAgentSkill} />
			</SettingsGroup>
		</div>
	)
}
