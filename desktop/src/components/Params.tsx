import { ChangeEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as ChevronDown } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-up.svg'
import { ModifyState, cx } from '~/lib/utils'
import { InfoTooltip } from './InfoTooltip'
import { ModelOptions as IModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { useToastProvider } from '~/providers/Toast'
import { listen } from '@tauri-apps/api/event'
import { ask } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import * as config from '~/lib/config'
import { path } from '@tauri-apps/api'
import { exists } from '@tauri-apps/plugin-fs'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { toast as hotToast } from 'react-hot-toast'
import { fetch } from '@tauri-apps/plugin-http'

import * as dialog from '@tauri-apps/plugin-dialog'
import { Claude, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig, Llm, Ollama, OpenAI } from '~/lib/llm'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const toast = useToastProvider()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [availableModels, setAvailableModels] = useState<string[]>([])
	const [fetchingModels, setFetchingModels] = useState(false)

	async function fetchAvailableModels(apiUrl: string, maxRetries = 2) {
		if (!apiUrl || fetchingModels) return

		setFetchingModels(true)
		setAvailableModels([])

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const baseUrl = apiUrl.replace(/\/$/, '')
				const modelsUrl = `${baseUrl}/models`

				const response = await fetch(modelsUrl, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				})

				if (!response.ok) {
					throw new Error(`Failed to fetch models: ${response.status}`)
				}

				const data = await response.json()
				const models = data?.data?.map((model: any) => model.id) || []

				if (models.length > 0) {
					setAvailableModels(models)
					setFetchingModels(false)
					return
				}
			} catch (error) {
				console.error(`Attempt ${attempt + 1} to fetch models failed:`, error)
			}
		}

		setFetchingModels(false)
	}

	useEffect(() => {
		if (preference.llmConfig?.platform === 'openai' && preference.llmConfig?.openaiApiUrl) {
			fetchAvailableModels(preference.llmConfig.openaiApiUrl)
		} else {
			setAvailableModels([])
		}
	}, [preference.llmConfig?.platform, preference.llmConfig?.openaiApiUrl])

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
			setLlm(llmInstance)
		} else if (preference.llmConfig?.platform === 'openai') {
			const llmInstance = new OpenAI(preference.llmConfig)
			setLlm(llmInstance)
		} else {
			const llmInstance = new Claude(preference.llmConfig)
			setLlm(llmInstance)
		}
	}, [preference.llmConfig])

	useEffect(() => {
		if (preference.recognizeSpeakers) {
			setOptions({ ...options, word_timestamps: false })
		}
	}, [preference.recognizeSpeakers, options.word_timestamps])

	async function handleProgressEvents() {
		listen<[number, number]>('download_progress', (event) => {
			// event.event is the event name (useful if you want to use a single callback fn for multiple event types)
			// event.payload is the payload object
			const [current, total] = event.payload
			const newDownloadProgress = Number(current / total) * 100
			toast.setProgress(newDownloadProgress)
		})
	}

	async function askOrEnableSpeakerRecognition() {
		const modelsFolder = await invoke<string>('get_models_folder')
		const embedModelPath = await path.join(modelsFolder, config.embeddingModelFilename)
		const segmentModelPath = await path.join(modelsFolder, config.segmentModelFilename)

		if ((await exists(embedModelPath)) && (await exists(segmentModelPath))) {
			preference.setRecognizeSpeakers(true)
		} else {
			const should_download = await ask(t('common.ask-for-download-model'))
			if (should_download) {
				toast.setProgress(0)
				toast.setMessage(t('common.downloading-ai-models'))
				toast.setOpen(true)
				await invoke('download_file', { url: config.embeddingModelUrl, path: embedModelPath })

				toast.setProgress(0)
				await invoke('download_file', { url: config.segmentModelUrl, path: segmentModelPath })
				preference.setRecognizeSpeakers(true)
				toast.setOpen(false)
			}
		}
	}

	//@ts-ignore
	async function onRecognizeSpeakerChange(event: ChangeEvent<HTMLInputElement>) {
		const enabled = event.target.checked
		if (enabled) {
			askOrEnableSpeakerRecognition()
		} else {
			preference.setRecognizeSpeakers(false)
		}
	}

	useEffect(() => {
		handleProgressEvents()
	}, [])

	async function validateLlmPrompt() {
		let valid = true
		if (!preference.llmConfig?.prompt) {
			valid = false
		} else {
			valid = preference.llmConfig.prompt.includes('%s')
		}
		if (!valid) {
			await dialog.message(t('common.invalid-llm-prompt'), {
				kind: 'error',
			})
		}
		return valid
	}

	const llmConfig = preference.llmConfig
	const setLlmConfig = preference.setLlmConfig

	async function onEnableLlm(_e: ChangeEvent<HTMLInputElement>) {
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

	return (
		<div className={cx('collapse !overflow-visible', open && 'collapse-open')}>
			<div onMouseDown={() => setOpen(!open)} className={cx('mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer')}>
				{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
				{t('common.more-options')}
			</div>
			{open && (
				<div className={cx(`collapse-content w-full`)}>
					<div className="label mt-5">
						<span className="label-text text-2xl font-bold">{t('common.speaker-recognition')}</span>
					</div>
					<div className="form-control w-full mt-3">
						<label className="label cursor-pointer">
							<span className="label-text flex items-center gap-1 cursor-default">
								<InfoTooltip text={t('common.info-recognize-speakers')} />
								{t('common.recognize-speakers')}
							</span>
							<input
								type="checkbox"
								className="toggle toggle-primary"
								checked={preference.recognizeSpeakers}
								onChange={onRecognizeSpeakerChange}
							/>
						</label>
					</div>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-max-speakers')} />
								{t('common.max-speakers')}
							</span>
						</div>
						<input
							onChange={(e) => preference.setMaxSpeakers(parseInt(e.target.value) || 5)}
							value={preference.maxSpeakers}
							className="input input-bordered"
							type="number"
						/>
					</label>

					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-diarize-threshold')} />
								{t('common.diarize-threshold')}
							</span>
						</div>
						<input
							onChange={(e) => preference.setDiarizeThreshold(parseFloat(e.target.value))}
							value={preference.diarizeThreshold}
							className="input input-bordered"
							type="number"
							step={0.1}
							min={0.0}
							max={1.0}
						/>
					</label>

					<div className="label mt-10">
						<span className="label-text text-2xl font-bold">{t('common.process-with-llm')} ✨</span>
					</div>
					<div className="form-control w-full mt-2">
						<label className="label cursor-pointer">
							<span className="label-text flex items-center gap-1 cursor-default">
								<InfoTooltip text={t('common.info-llm-summarize')} />
								{t('common.process-with-llm')}
							</span>
							<input type="checkbox" className="toggle toggle-primary" checked={preference.llmConfig?.enabled} onChange={(e) => onEnableLlm(e)} />
						</label>
					</div>

					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">{t('common.llm-platform')}</span>
						</div>
						<select
							value={llmConfig?.platform}
							onChange={(e) => {
								const newPlatform = e.target.value
								if (newPlatform === 'ollama') {
									const defaultConfig = defaultOllamaConfig()
									setLlmConfig({
										...defaultConfig,
										ollamaBaseUrl: llmConfig.ollamaBaseUrl,
										claudeApiKey: llmConfig.claudeApiKey,
										openaiApiUrl: llmConfig.openaiApiUrl,
										enabled: llmConfig?.enabled ?? false,
									})
								} else if (newPlatform === 'claude') {
									const defaultConfig = defaultClaudeConfig()
									setLlmConfig({
										...defaultConfig,
										ollamaBaseUrl: llmConfig.ollamaBaseUrl,
										claudeApiKey: llmConfig.claudeApiKey,
										openaiApiUrl: llmConfig.openaiApiUrl,
										enabled: llmConfig?.enabled ?? false,
									})
								} else if (newPlatform === 'openai') {
									const defaultConfig = defaultOpenAIConfig()
									setLlmConfig({
										...defaultConfig,
										ollamaBaseUrl: llmConfig.ollamaBaseUrl,
										claudeApiKey: llmConfig.claudeApiKey,
										openaiApiUrl: llmConfig.openaiApiUrl,
										enabled: llmConfig?.enabled ?? false,
									})
								}
							}}
							className="select select-bordered">
							<option value="claude">Claude</option>
							<option value="ollama">Ollama</option>
							<option value="openai">OpenAI Compatible</option>
						</select>
					</label>

					{llmConfig?.platform === 'claude' && (
						<label className="form-control w-full">
							<div className="label">
								<span className="label-text flex items-center gap-1">
									<InfoTooltip text={t('common.info-llm-api-key')} />
									{t('common.llm-api-key')}
									<div onClick={() => shellOpen(config.llmApiKeyUrl)} className="link link-primary">
										{t('common.find-here')}
									</div>
								</span>
							</div>

							<input
								value={llmConfig?.claudeApiKey}
								onChange={(e) => setLlmConfig({ ...preference.llmConfig, claudeApiKey: e.target.value })}
								className="input input-bordered opacity-50 text-sm"
								placeholder="Paste here your API key"
								type="text"
							/>
						</label>
					)}

					{llmConfig?.platform === 'ollama' && (
						<>
							<label className="form-control w-full">
								<div className="label">
									<span className="label-text flex items-center gap-1">{t('common.ollama-base-url')}</span>
								</div>
								<input
									value={llmConfig?.ollamaBaseUrl}
									onChange={(e) => setLlmConfig({ ...preference.llmConfig, ollamaBaseUrl: e.target.value })}
									className="input input-bordered opacity-50 text-sm"></input>
							</label>
							<label className="form-control w-full">
								<div className="label">
									<span className="label-text flex items-center gap-1">
										{t('common.llm-model')}{' '}
										{llmConfig.platform === 'ollama' && (
											<div className="link link-primary" onClick={() => shellOpen(`https://ollama.com/library/${llmConfig.model}`)}>
												{t('common.find-here')}
											</div>
										)}
									</span>
								</div>
								<input
									value={llmConfig?.model}
									onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })}
									className="input input-bordered opacity-50 text-sm"></input>
							</label>
						</>
					)}

					{llmConfig?.platform === 'openai' && (
						<>
							<label className="form-control w-full">
								<div className="label">
									<span className="label-text flex items-center gap-1">{t('common.openai-api-url')}</span>
								</div>
								<input
									value={llmConfig?.openaiApiUrl}
									onChange={(e) => setLlmConfig({ ...preference.llmConfig, openaiApiUrl: e.target.value })}
									className="input input-bordered opacity-50 text-sm"
									placeholder="http://localhost:1234/v1"></input>
							</label>
							<label className="form-control w-full">
								<div className="label">
									<span className="label-text flex items-center gap-1">
										{t('common.llm-model')}
										{fetchingModels && <span className="loading loading-spinner loading-xs"></span>}
									</span>
								</div>
								{availableModels.length > 0 ? (
									<select
										value={llmConfig?.model}
										onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })}
										className="select select-bordered opacity-50 text-sm">
										<option value="" disabled>
											Select a model
										</option>
										{availableModels.map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))}
									</select>
								) : (
										<input
											value={llmConfig?.model}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })}
											className="input input-bordered opacity-50 text-sm"
										placeholder="qwen3-next-80b-a3b-instruct"
										disabled={fetchingModels}></input>
								)}
							</label>
						</>
					)}

					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-llm-prompt')} />
								{t('common.llm-prompt')}
							</span>
						</div>
						<textarea
							value={llmConfig?.prompt}
							onChange={(e) => setLlmConfig({ ...preference.llmConfig, prompt: e.target.value })}
							onBlur={validateLlmPrompt}
							className="textarea textarea-bordered w-full"></textarea>
					</label>

					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-max-tokens')} />
								{t('common.max-tokens')}
							</span>
						</div>
						<input
							onChange={(e) => setLlmConfig({ ...llmConfig, maxTokens: parseInt(e.target.value) ?? 1 })}
							value={llmConfig?.maxTokens}
							className="input input-bordered"
							type="number"
						/>
					</label>

					<label className="form-control w-full mt-5">
						<button onClick={checkLlm} className="btn btn-primary btn-sm">
							{t('common.run-llm-check')}
						</button>
					</label>

					{llmConfig?.platform === 'claude' && (
						<>
							<div onClick={() => shellOpen(config.llmLimitsUrl)} className="link link-primary mt-2">
								{t('common.set-monthly-spend-limit')}
							</div>

							<div onClick={() => shellOpen(config.llmCostUrl)} className="link link-primary mt-2">
								{t('common.llm-current-cost')}
							</div>
						</>
					)}

					<div className="label mt-10">
						<span className="label-text text-2xl font-bold">{t('common.model-options')}</span>
					</div>
					<div className="form-control w-full mt-3">
						<label className="label cursor-pointer">
							<span className="label-text flex items-center gap-1 cursor-default">
								<InfoTooltip text={t('common.info-translate-to-english')} />
								{t('common.translate-to-english')}
							</span>

							<input
								type="checkbox"
								className="toggle toggle-primary"
								checked={options.translate}
								onChange={(e) => setOptions({ ...options, translate: e.target.checked })}
							/>
						</label>
					</div>

					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-prompt')} />
								{t('common.prompt')} ({t('common.leftover')} {1024 - (options?.init_prompt?.length ?? 0)} {t('common.characters')})
							</span>
						</div>
						<textarea
							value={options?.init_prompt}
							onChange={(e) => setOptions({ ...options, init_prompt: e.target.value.slice(0, 1024) })}
							className="textarea textarea-bordered w-full"></textarea>
					</label>

					<div className="form-control w-full mt-3">
						<label className="label cursor-pointer">
							<span className="label-text flex items-center gap-1 cursor-default">
								<InfoTooltip text={t('common.info-use-word-timestamps')} />
								{t('common.use-word-timestamps')}
							</span>

							<input
								type="checkbox"
								className="toggle toggle-primary"
								checked={options.word_timestamps}
								onChange={(e) => setOptions({ ...options, word_timestamps: e.target.checked })}
							/>
						</label>
					</div>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-max-sentence-len')} />
								{t('common.max-sentence-len')}
							</span>
						</div>
						<input
							value={options.max_sentence_len}
							onChange={(e) => {
								if (!options.word_timestamps) {
									dialog.message(t('common.please-enable-word-timestamps'))
								}
								setOptions({ ...options, max_sentence_len: parseInt(e.target.value) ?? 1 })
							}}
							className="input input-bordered"
							type="number"
						/>
					</label>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-threads')} />
								{t('common.threads')}
							</span>
						</div>
						<input
							value={options.n_threads}
							onChange={(e) => setOptions({ ...options, n_threads: parseInt(e.target.value) })}
							className="input input-bordered"
							type="number"
						/>
					</label>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-temperature')} />
								{t('common.temperature')}
							</span>
						</div>
						<input
							step={0.1}
							value={options.temperature}
							onChange={(e) => setOptions({ ...options, temperature: parseFloat(e.target.value) })}
							className="input input-bordered"
							type="number"
						/>
					</label>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={t('common.info-max-text-ctx')} />
								{t('common.max-text-ctx')}
							</span>
						</div>
						<input
							step={1}
							value={options.max_text_ctx ?? 0}
							onChange={(e) => setOptions({ ...options, max_text_ctx: parseInt(e.target.value) })}
							className="input input-bordered"
							type="number"
						/>
					</label>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text="Greedy vs Beam Search: Default is Beam Search (Size 5, Patience -1), which evaluates 5 possible sequences at each step for more accurate results, but is slower. Greedy, on the other hand, selects the best token from the top 5 at each step, making it faster but potentially less accurate." />
								{t('common.sampling-strategy')}
							</span>
						</div>

						<select
							value={preference.modelOptions.sampling_strategy}
							onChange={(e) => {
								const newStrategy = e.target.value
								preference.setModelOptions({ ...preference.modelOptions, sampling_strategy: newStrategy as 'greedy' | 'beam search' })
							}}
							className="select select-bordered capitalize">
							{['beam search', 'greedy'].map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</label>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text="best_of: Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower. beam_size: Paths explored in Beam Search (default: 5) — higher = better accuracy, slower." />
								{preference.modelOptions.sampling_strategy === 'greedy' ? 'Besf of' : 'Beam size'}
							</span>
						</div>
						<input
							step={1}
							value={preference.modelOptions.sampling_bestof_or_beam_size ?? 5}
							onChange={(e) => setOptions({ ...options, sampling_bestof_or_beam_size: parseInt(e.target.value) })}
							className="input input-bordered"
							type="number"
						/>
					</label>
					<div className="label mt-10">
						<span className="label-text text-2xl font-bold">{t('common.ffmpeg-options')}</span>
					</div>
					<div className="form-control w-full mt-3">
						<label className="label cursor-pointer">
							<span className="label-text flex items-center gap-1 cursor-default">
								<InfoTooltip text={t('common.info-normalize-loudness')} />
								{t('common.normalize-loudness')}
							</span>

							<input
								type="checkbox"
								className="toggle toggle-primary"
								checked={preference.ffmpegOptions.normalize_loudness}
								onChange={(e) => preference.setFfmpegOptions({ ...preference.ffmpegOptions, normalize_loudness: e.target.checked })}
							/>
						</label>
					</div>
					<label className="form-control w-full">
						<div className="label">
							<span className="label-text flex items-center gap-1">
								<InfoTooltip text={'ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error'} />
								{t('common.custom-ffmpeg-command')}
							</span>
						</div>

						<input
							value={preference.ffmpegOptions.custom_command ?? ''}
							onChange={(e) =>
								preference.setFfmpegOptions({ ...preference.ffmpegOptions, custom_command: e.target.value ? e.target.value : null })
							}
							className="input input-bordered opacity-50 text-sm"
							placeholder={preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : ''}
							type="text"
						/>
					</label>

					<div className="label mt-8">
						<span className="label-text text-2xl font-bold">{t('common.presets')}</span>
					</div>

					<label className="form-control w-full mt-5">
						<button onClick={preference.enableSubtitlesPreset} className="btn btn-md btn-secondary">
							{t('common.preset-for-subtitles')}
						</button>
					</label>

					<label className="form-control w-full">
						<button onClick={preference.resetOptions} className="btn btn-md">
							{t('common.reset-options')}
						</button>
					</label>
				</div>
			)}
		</div>
	)
}
