import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { SectionCard, type SettingsViewModel } from './shared'

export function TranscriptionSection({ vm }: { vm: SettingsViewModel }) {

	return (
		<div className="space-y-5">
			<SectionCard><LanguageInput /></SectionCard>
			<SectionCard>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/45 py-2">
					<span className="text-sm font-medium">{m.playSoundOnFinish()}</span>
					<Switch checked={vm.preference.soundOnFinish} onCheckedChange={vm.preference.setSoundOnFinish} />
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2 pb-1 pt-4">
					<span className="text-sm font-medium">{m.focusWindowOnFinish()}</span>
					<Switch checked={vm.preference.focusOnFinish} onCheckedChange={vm.preference.setFocusOnFinish} />
				</div>
			</SectionCard>
			<div className="space-y-2">
				<div className="flex items-center gap-1 px-1">
					<InfoTooltip text={m.recordingSavePathInfo()} />
					<span className="text-sm font-semibold text-foreground/95">{m.recordingSavePath()}</span>
				</div>
				<SectionCard>
					<div className="flex items-center justify-between gap-2">
						<p className="min-w-0 truncate text-sm text-muted-foreground" title={vm.preference.customRecordingPath ?? vm.defaultRecordingPath}>
							{vm.preference.customRecordingPath ?? vm.defaultRecordingPath}
						</p>
						<div className="flex shrink-0 items-center gap-2">
							{vm.preference.customRecordingPath && <Button variant="ghost" size="sm" onMouseDown={vm.resetRecordingPath}>{m.resetToDefault()}</Button>}
							<Button variant="outline" size="sm" onMouseDown={vm.changeRecordingPath}>{m.changeRecordingPath()}</Button>
						</div>
					</div>
				</SectionCard>
			</div>
		</div>
	)
}
