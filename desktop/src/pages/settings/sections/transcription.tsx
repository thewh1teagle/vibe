import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

export function TranscriptionSection({ vm }: { vm: SettingsViewModel }) {
	const recordingPath = vm.preference.customRecordingPath ?? vm.defaultRecordingPath

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

			<SettingsGroup title={m.recordingSavePath()} description={m.recordingSavePathInfo()}>
				<SettingsRow
					label={
						<span title={recordingPath} className="block truncate font-mono text-xs text-muted-foreground">
							{recordingPath}
						</span>
					}>
					{vm.preference.customRecordingPath && (
						<Button variant="ghost" size="sm" onMouseDown={vm.resetRecordingPath}>
							{m.resetToDefault()}
						</Button>
					)}
					<Button variant="outline" size="sm" onMouseDown={vm.changeRecordingPath}>
						{m.changeRecordingPath()}
					</Button>
				</SettingsRow>
			</SettingsGroup>
		</div>
	)
}
