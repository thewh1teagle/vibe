import { openUrl } from '@tauri-apps/plugin-opener'
import { Bot, FileJson } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { Switch } from '~/components/ui/switch'
import { ClaudeCodeMark, CodexMark } from '~/components/agent-marks'
import { ActionRow, SettingsGroup, SettingsNote, SettingsRow, type SettingsViewModel } from './shared'

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

			<SettingsGroup title={m.apiSection()} className={!vm.apiBaseUrl ? 'pointer-events-none opacity-50' : undefined}>
				<ActionRow
					label={m.swaggerDocs()}
					icon={<LinkIcon className="h-4 w-4" />}
					disabled={!apiDocsUrl}
					onClick={() => (apiDocsUrl ? openUrl(apiDocsUrl) : null)}
				/>
				<ActionRow label={m.copyAgentSkill()} icon={<Bot className="h-4 w-4" />} disabled={!vm.apiBaseUrl} onClick={vm.copyAgentSkill} />
			</SettingsGroup>

			{/* Installing writes the same instructions to disk, so every future agent session has them. */}
			<SettingsGroup title={m.skillSection()} description={m.skillSectionDescription()}>
				{/* Installing needs the running server (the skill embeds what it serves); copying never does. */}
				<ActionRow
					label={m.installSkillClaudeCode()}
					icon={<ClaudeCodeMark />}
					disabled={!vm.apiBaseUrl}
					onClick={() => vm.installAgentSkill('claude')}
				/>
				<ActionRow label={m.installSkillCodex()} icon={<CodexMark />} disabled={!vm.apiBaseUrl} onClick={() => vm.installAgentSkill('codex')} />
				<SettingsNote>
					<span className="italic">{m.agentPromptHint()}</span>
				</SettingsNote>
			</SettingsGroup>

			{/* The settings file is the other half of the agent story: it works whether or not the API runs. */}
			<SettingsGroup>
				<ActionRow label={m.configFile()} icon={<FileJson className="h-4 w-4" />} onClick={vm.revealConfigFile} />
			</SettingsGroup>
		</div>
	)
}
