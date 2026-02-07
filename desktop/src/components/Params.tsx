import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as ChevronDown } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-up.svg'
import { ModifyState } from '~/lib/utils'
import { InfoTooltip } from './InfoTooltip'
import { ModelOptions as IModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { useToastProvider } from '~/providers/Toast'
import { listen } from '@tauri-apps/api/event'
import * as config from '~/lib/config'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { toast as hotToast } from 'sonner'
import * as dialog from '@tauri-apps/plugin-dialog'
import { Claude, defaultClaudeConfig, defaultOllamaConfig, Llm, Ollama } from '~/lib/llm'
import { Button } from '~/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { NativeSelect } from '~/components/ui/native-select'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="space-y-2 w-full">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const toast = useToastProvider()
	const [llm, setLlm] = useState<Llm | null>(null)

	useEffect(() => {
		const llmInstance = preference.llmConfig?.platform === 'ollama' ? new Ollama(preference.llmConfig) : new Claude(preference.llmConfig)
		setLlm(llmInstance)
	}, [preference.llmConfig])

	useEffect(() => {
		listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			toast.setProgress(Number(current / total) * 100)
		})
	}, [])

	async function validateLlmPrompt() {
		const valid = Boolean(preference.llmConfig?.prompt && preference.llmConfig.prompt.includes('%s'))
		if (!valid) {
			await dialog.message(t('common.invalid-llm-prompt'), { kind: 'error' })
		}
		return valid
	}

	const llmConfig = preference.llmConfig
	const setLlmConfig = preference.setLlmConfig

	function onEnableLlm() {
		preference.setLlmConfig({ ...llmConfig, enabled: !llmConfig?.enabled })
	}

	async function checkLlm() {
		try {
			const promise = llm!.ask('Hello, how are you?')
			hotToast.promise(promise, {
				error: t('common.check-error') as string,
				success: t('common.check-success') as string,
				loading: t('common.check-loading') as string,
			})
			await promise
		} catch (e) {
			console.error(e)
		}
	}

	function parseIntOr(value: string, fallback: number) {
		const n = parseInt(value, 10)
		return Number.isNaN(n) ? fallback : n
	}

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger asChild>
				<button type="button" className="mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer">
					{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
					{t('common.more-options')}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-3 w-full space-y-4">
				<div className="mt-5 text-2xl font-bold">{t('common.process-with-llm')} ✨</div>

				<div className="flex items-center justify-between">
					<span className="text-sm font-medium flex items-center gap-1">
						<InfoTooltip text={t('common.info-llm-summarize')} />
						{t('common.process-with-llm')}
					</span>
					<Switch checked={preference.llmConfig?.enabled} onCheckedChange={onEnableLlm} />
				</div>

				<Field label={t('common.llm-platform')}>
					<NativeSelect
						value={llmConfig?.platform}
						onChange={(e) => {
							const newPlatform = e.target.value
							if (newPlatform === 'ollama') {
								const defaultConfig = defaultOllamaConfig()
								setLlmConfig({ ...defaultConfig, ollamaBaseUrl: llmConfig.ollamaBaseUrl, claudeApiKey: llmConfig.claudeApiKey, enabled: llmConfig?.enabled ?? false })
							} else if (newPlatform === 'claude') {
								const defaultConfig = defaultClaudeConfig()
								setLlmConfig({ ...defaultConfig, ollamaBaseUrl: llmConfig.ollamaBaseUrl, claudeApiKey: llmConfig.claudeApiKey, enabled: llmConfig?.enabled ?? false })
							}
						}}
						className="capitalize">
						{['claude', 'ollama'].map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</NativeSelect>
				</Field>

				{llmConfig?.platform === 'claude' && (
					<Field
						label={
							<>
								<InfoTooltip text={t('common.info-llm-api-key')} />
								{t('common.llm-api-key')}
								<button type="button" className="text-primary underline hover:text-primary/80" onClick={() => shellOpen(config.llmApiKeyUrl)}>
									{t('common.find-here')}
								</button>
							</>
						}>
						<Input
							value={llmConfig?.claudeApiKey}
							onChange={(e) => setLlmConfig({ ...preference.llmConfig, claudeApiKey: e.target.value })}
							placeholder="Paste here your API key"
							type="text"
						/>
					</Field>
				)}

				{llmConfig?.platform === 'ollama' && (
					<>
						<Field label={t('common.ollama-base-url')}>
							<Input value={llmConfig?.ollamaBaseUrl} onChange={(e) => setLlmConfig({ ...preference.llmConfig, ollamaBaseUrl: e.target.value })} />
						</Field>
						<Field
							label={
								<>
									{t('common.llm-model')}
									<button type="button" className="text-primary underline hover:text-primary/80" onClick={() => shellOpen(`https://ollama.com/library/${llmConfig.model}`)}>
										{t('common.find-here')}
									</button>
								</>
							}>
							<Input value={llmConfig?.model} onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })} />
						</Field>
					</>
				)}

				<Field
					label={
						<>
							<InfoTooltip text={t('common.info-llm-prompt')} />
							{t('common.llm-prompt')}
						</>
					}>
					<Textarea value={llmConfig?.prompt} onChange={(e) => setLlmConfig({ ...preference.llmConfig, prompt: e.target.value })} onBlur={validateLlmPrompt} />
				</Field>

				<Field
					label={
						<>
							<InfoTooltip text={t('common.info-max-tokens')} />
							{t('common.max-tokens')}
						</>
					}>
					<Input type="number" onChange={(e) => setLlmConfig({ ...llmConfig, maxTokens: parseIntOr(e.target.value, 1) })} value={llmConfig?.maxTokens} />
				</Field>

				<Button onClick={checkLlm} size="sm" className="w-full mt-1">
					{t('common.run-llm-check')}
				</Button>

				{llmConfig?.platform === 'claude' && (
					<div className="flex flex-col gap-2">
						<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => shellOpen(config.llmLimitsUrl)}>
							{t('common.set-monthly-spend-limit')}
						</button>
						<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => shellOpen(config.llmCostUrl)}>
							{t('common.llm-current-cost')}
						</button>
					</div>
				)}

				<div className="mt-8 text-2xl font-bold">{t('common.model-options')}</div>

				<div className="flex items-center justify-between">
					<span className="text-sm font-medium flex items-center gap-1">
						<InfoTooltip text={t('common.info-translate-to-english')} />
						{t('common.translate-to-english')}
					</span>
					<Switch checked={Boolean(options.translate)} onCheckedChange={(checked) => setOptions({ ...options, translate: checked })} />
				</div>

				<Field
					label={
						<>
							<InfoTooltip text={t('common.info-prompt')} />
							{t('common.prompt')} ({t('common.leftover')} {1024 - (options?.init_prompt?.length ?? 0)} {t('common.characters')})
						</>
					}>
					<Textarea value={options?.init_prompt} onChange={(e) => setOptions({ ...options, init_prompt: e.target.value.slice(0, 1024) })} />
				</Field>

				<div className="flex items-center justify-between">
					<span className="text-sm font-medium flex items-center gap-1">
						<InfoTooltip text={t('common.info-use-word-timestamps')} />
						{t('common.use-word-timestamps')}
					</span>
					<Switch checked={Boolean(options.word_timestamps)} onCheckedChange={(checked) => setOptions({ ...options, word_timestamps: checked })} />
				</div>

				<Field label={<><InfoTooltip text={t('common.info-max-sentence-len')} />{t('common.max-sentence-len')}</>}>
					<Input
						type="number"
						value={options.max_sentence_len}
						onChange={(e) => {
							if (!options.word_timestamps) dialog.message(t('common.please-enable-word-timestamps'))
							setOptions({ ...options, max_sentence_len: parseIntOr(e.target.value, 1) })
						}}
					/>
				</Field>

				<Field label={<><InfoTooltip text={t('common.info-threads')} />{t('common.threads')}</>}>
					<Input type="number" value={options.n_threads} onChange={(e) => setOptions({ ...options, n_threads: parseIntOr(e.target.value, 1) })} />
				</Field>

				<Field label={<><InfoTooltip text={t('common.info-temperature')} />{t('common.temperature')}</>}>
					<Input type="number" step={0.1} value={options.temperature} onChange={(e) => setOptions({ ...options, temperature: parseFloat(e.target.value) || 0 })} />
				</Field>

				<Field label={<><InfoTooltip text={t('common.info-max-text-ctx')} />{t('common.max-text-ctx')}</>}>
					<Input type="number" step={1} value={options.max_text_ctx ?? 0} onChange={(e) => setOptions({ ...options, max_text_ctx: parseIntOr(e.target.value, 0) })} />
				</Field>

				<Field
					label={
						<>
							<InfoTooltip text="Greedy vs Beam Search: Default is Beam Search (Size 5, Patience -1), which evaluates 5 possible sequences at each step for more accurate results, but is slower. Greedy, on the other hand, selects the best token from the top 5 at each step, making it faster but potentially less accurate." />
							{t('common.sampling-strategy')}
						</>
					}>
					<NativeSelect
						value={preference.modelOptions.sampling_strategy}
						onChange={(e) => preference.setModelOptions({ ...preference.modelOptions, sampling_strategy: e.target.value as 'greedy' | 'beam search' })}
						className="capitalize">
						{['beam search', 'greedy'].map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</NativeSelect>
				</Field>

				<Field
					label={
						<>
							<InfoTooltip text="best_of: Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower. beam_size: Paths explored in Beam Search (default: 5) — higher = better accuracy, slower." />
							{preference.modelOptions.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}
						</>
					}>
					<Input
						type="number"
						step={1}
						value={preference.modelOptions.sampling_bestof_or_beam_size ?? 5}
						onChange={(e) => setOptions({ ...options, sampling_bestof_or_beam_size: parseIntOr(e.target.value, 5) })}
					/>
				</Field>

				<div className="mt-8 text-2xl font-bold">{t('common.ffmpeg-options')}</div>
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium flex items-center gap-1">
						<InfoTooltip text={t('common.info-normalize-loudness')} />
						{t('common.normalize-loudness')}
					</span>
					<Switch
						checked={preference.ffmpegOptions.normalize_loudness}
						onCheckedChange={(checked) => preference.setFfmpegOptions({ ...preference.ffmpegOptions, normalize_loudness: checked })}
					/>
				</div>

				<Field
					label={
						<>
							<InfoTooltip text={'ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error'} />
							{t('common.custom-ffmpeg-command')}
						</>
					}>
					<Input
						value={preference.ffmpegOptions.custom_command ?? ''}
						onChange={(e) => preference.setFfmpegOptions({ ...preference.ffmpegOptions, custom_command: e.target.value || null })}
						placeholder={preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : ''}
						type="text"
					/>
				</Field>

				<div className="mt-8 text-2xl font-bold">{t('common.presets')}</div>
				<Button variant="secondary" onClick={preference.enableSubtitlesPreset} className="w-full mt-2">
					{t('common.preset-for-subtitles')}
				</Button>
				<Button variant="secondary" onClick={preference.resetOptions} className="w-full">
					{t('common.reset-options')}
				</Button>
			</CollapsibleContent>
		</Collapsible>
	)
}
