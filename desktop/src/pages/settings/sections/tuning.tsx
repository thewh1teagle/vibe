import { message } from '@tauri-apps/plugin-dialog'
import { RotateCcw, Wand2 } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import NumberField from '~/components/number-field'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, SettingsField, SettingsGroup, SettingsNote, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

const textareaClass = 'min-h-24 max-h-60 w-full resize-none overflow-y-auto rounded-lg bg-muted/40 text-sm'

export function TuningSection({ vm }: { vm: SettingsViewModel }) {
	// More threads than cores only makes decoding slower, so the stepper stops there.
	const maxThreads = Math.max(1, navigator.hardwareConcurrency || 8)
	const promptLength = vm.preference.modelOptions?.init_prompt?.length ?? 0
	const isGreedy = vm.preference.modelOptions.sampling_strategy === 'greedy'

	return (
		<div className="space-y-6">
			<SettingsGroup title={m.speakerTiming()}>
				<SettingsRow label={m.enableDiarization()} description={m.infoDiarization()}>
					<Switch checked={vm.preference.diarizeEnabled} onCheckedChange={vm.toggleDiarization} />
				</SettingsRow>
				{vm.preference.diarizeEnabled && <SettingsNote>{m.diarizeMaxSpeakersNote()}</SettingsNote>}
				<SettingsRow label={m.enableStableTimestamps()} description={m.stableTimestampsInfo()}>
					<Switch checked={vm.preference.stableTimestampsEnabled} onCheckedChange={vm.handleStableTimestampsToggle} />
				</SettingsRow>
				{vm.preference.stableTimestampsEnabled && <SettingsNote>{m.stableTimestampsSlowNote()}</SettingsNote>}
			</SettingsGroup>

			<SettingsGroup title={m.modelOptions()}>
				<SettingsRow label={m.translateToEnglish()} description={m.infoTranslateToEnglish()}>
					<Switch
						checked={Boolean(vm.preference.modelOptions.translate)}
						onCheckedChange={(checked) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, translate: checked })}
					/>
				</SettingsRow>
				{vm.preference.modelOptions.translate && <SettingsNote>{m.translateWhisperModelNote()}</SettingsNote>}

				<SettingsRow label={m.useWordTimestamps()} description={m.infoUseWordTimestamps()}>
					<Switch
						checked={Boolean(vm.preference.modelOptions.word_timestamps)}
						onCheckedChange={(checked) => {
							// The switch does nothing without a length, so say so rather than letting it look broken.
							if (checked && !vm.preference.modelOptions.max_sentence_len) message(m.pleaseSetMaxSentenceLen())
							vm.preference.setModelOptions({ ...vm.preference.modelOptions, word_timestamps: checked })
						}}
					/>
				</SettingsRow>

				<SettingsRow label={m.maxSentenceLen()} description={m.infoMaxSentenceLen()}>
					<NumberField
						aria-label={m.maxSentenceLen()}
						value={vm.preference.modelOptions.max_sentence_len ?? 0}
						min={0}
						max={512}
						onChange={(value) => {
							if (!vm.preference.modelOptions.word_timestamps) message(m.pleaseEnableWordTimestamps())
							vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_sentence_len: value })
						}}
					/>
				</SettingsRow>

				<SettingsField
					label={m.prompt()}
					description={m.infoPrompt()}
					footer={promptLength > 0 ? `${1024 - promptLength} ${m.characters()} ${m.leftover().toLowerCase()}` : undefined}>
					<Textarea
						value={vm.preference.modelOptions?.init_prompt}
						onChange={(e) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, init_prompt: e.target.value.slice(0, 1024) })}
						placeholder={m.promptPlaceholder()}
						className={textareaClass}
					/>
				</SettingsField>
			</SettingsGroup>

			<SettingsGroup title={m.decoding()}>
				<SettingsRow label={m.samplingStrategy()} description={m.samplingStrategyInfo()}>
					<Select
						value={vm.preference.modelOptions.sampling_strategy}
						onValueChange={(value) =>
							vm.preference.setModelOptions({ ...vm.preference.modelOptions, sampling_strategy: value as 'greedy' | 'beam search' })
						}>
						<SelectTrigger className={`w-40 capitalize ${rowControlClass}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{['beam search', 'greedy'].map((name) => (
								<SelectItem key={name} value={name} className="capitalize">
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingsRow>

				<SettingsRow label={isGreedy ? m.bestOf() : m.beamSize()} description={isGreedy ? m.greedyInfo() : m.beamInfo()}>
					<NumberField
						aria-label={isGreedy ? m.bestOf() : m.beamSize()}
						value={isGreedy ? (vm.preference.modelOptions.best_of ?? 5) : (vm.preference.modelOptions.beam_size ?? 5)}
						min={1}
						max={10}
						onChange={(value) => {
							if (isGreedy) {
								vm.preference.setModelOptions({ ...vm.preference.modelOptions, best_of: value })
							} else {
								vm.preference.setModelOptions({ ...vm.preference.modelOptions, beam_size: value })
							}
						}}
					/>
				</SettingsRow>

				<SettingsRow label={m.temperature()} description={m.infoTemperature()}>
					<NumberField
						aria-label={m.temperature()}
						value={vm.preference.modelOptions.temperature ?? 0}
						min={0}
						max={1}
						step={0.1}
						onChange={(value) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, temperature: value })}
					/>
				</SettingsRow>

				<SettingsRow label={m.maxTextCtx()} description={m.infoMaxTextCtx()}>
					<NumberField
						aria-label={m.maxTextCtx()}
						value={vm.preference.modelOptions.max_text_ctx ?? 0}
						min={0}
						max={16384}
						step={64}
						onChange={(value) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_text_ctx: value })}
					/>
				</SettingsRow>

				<SettingsRow label={m.threads()} description={m.infoThreads()}>
					<NumberField
						aria-label={m.threads()}
						value={vm.preference.modelOptions.n_threads ?? 1}
						min={1}
						max={maxThreads}
						onChange={(value) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, n_threads: value })}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.ffmpegOptions()}>
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

			<SettingsGroup title={m.presets()}>
				<ActionRow label={m.presetForSubtitles()} icon={<Wand2 className="h-4 w-4" />} onClick={vm.preference.enableSubtitlesPreset} />
				<ActionRow label={m.resetOptions()} icon={<RotateCcw className="h-4 w-4" />} onClick={vm.preference.resetOptions} />
			</SettingsGroup>
		</div>
	)
}
