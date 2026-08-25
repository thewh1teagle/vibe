import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

export function TranscriptionSection({ vm }: { vm: SettingsViewModel }) {
	const projectsPath = vm.preference.projectsPath ?? vm.defaultProjectsPath

	return (
		<div className="space-y-6">
			<SettingsGroup>
				{/* LanguageInput lives outside this page; reflow it into a settings row. */}
				<div className="[&>div]:flex [&>div]:min-h-[52px] [&>div]:items-center [&>div]:justify-between [&>div]:gap-4 [&>div]:space-y-0 [&>div]:px-4 [&>div]:py-2.5 [&_label]:text-sm [&_label]:font-normal [&_button]:h-9 [&_button]:w-52 [&_button]:rounded-lg">
					<LanguageInput />
				</div>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label={m.playSoundOnFinish()}>
					<Switch checked={vm.preference.soundOnFinish} onCheckedChange={vm.preference.setSoundOnFinish} />
				</SettingsRow>
				<SettingsRow label={m.focusWindowOnFinish()}>
					<Switch checked={vm.preference.focusOnFinish} onCheckedChange={vm.preference.setFocusOnFinish} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.projectsFolder()} description={m.projectsFolderInfo()}>
				<SettingsRow
					label={
						<span title={projectsPath} className="block truncate font-mono text-xs text-muted-foreground">
							{projectsPath}
						</span>
					}>
					{vm.preference.projectsPath && (
						<Button variant="ghost" size="sm" onMouseDown={vm.resetProjectsPath}>
							{m.resetToDefault()}
						</Button>
					)}
					<Button variant="outline" size="sm" onMouseDown={vm.changeProjectsPath}>
						{m.changeProjectsFolder()}
					</Button>
				</SettingsRow>
			</SettingsGroup>
		</div>
	)
}
