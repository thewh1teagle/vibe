import { RotateCcw } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { ActionRow, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

export function AudioProcessingSection({ vm }: { vm: SettingsViewModel }) {
	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow label={m.normalizeLoudness()} description={m.infoNormalizeLoudness()}>
					<Switch
						checked={vm.preference.ffmpegOptions.normalize_loudness}
						onCheckedChange={(checked) => vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, normalize_loudness: checked })}
					/>
				</SettingsRow>
				<SettingsRow
					label={m.customFfmpegCommand()}
					description="ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error">
					<Input
						value={vm.preference.ffmpegOptions.custom_command ?? ''}
						onChange={(e) => vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, custom_command: e.target.value || null })}
						placeholder={vm.preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : '-af ...'}
						type="text"
						className={`w-64 ${rowControlClass}`}
					/>
				</SettingsRow>
			</SettingsGroup>
			<SettingsGroup>
				<ActionRow
					label={m.resetAudioProcessing()}
					icon={<RotateCcw className="h-4 w-4" />}
					activateOnClick
					onClick={() => vm.preference.setFfmpegOptions({ normalize_loudness: false, custom_command: null })}
				/>
			</SettingsGroup>
		</div>
	)
}
