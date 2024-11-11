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

import * as dialog from '@tauri-apps/plugin-dialog'
import { Claude, defaultClaudeConfig, defaultOllamaConfig, Llm, Ollama } from '~/lib/llm'

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

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
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
		const promise = llm!.ask('Hello, how are you?')
		hotToast.promise(promise, {
			error: t('common.check-error') as string,
			success: t('common.check-success') as string,
			loading: t('common.check-loading') as string,
		})
	}

	return (
		<div className={cx('collapse !overflow-visible', open && 'collapse-open')}>
			<div onMouseDown={() => setOpen(!open)} className={cx('mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer')}>
				{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
				{t('common.more-options')}
			</div>
			<div className="collapse-content w-full">
				<div className="label mt-5">
					<span className="label-text text-2xl font-bold">{t('common.speaker-recognition')}</span>
				</div>
				<div className="form-control w-full mt-3">
					<label className="label cursor-pointer">
						<span className="label-text flex items-center gap-1 cursor-default">
							<InfoTooltip text={t('common.info-recognize-speakers')} />
							{t('common.recognize-speakers')}
						</span>
						<input type="checkbox" className="toggle toggle-primary" checked={preference.recognizeSpeakers} onChange={onRecognizeSpeakerChange} />
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
									enabled: llmConfig?.enabled ?? false,
								})
							} else if (newPlatform === 'claude') {
								const defaultConfig = defaultClaudeConfig()
								setLlmConfig({
									...defaultConfig,
									ollamaBaseUrl: llmConfig.ollamaBaseUrl,
									claudeApiKey: llmConfig.claudeApiKey,
									enabled: llmConfig?.enabled ?? false,
								})
							}
						}}
						className="select select-bordered capitalize">
						{['claude', 'ollama'].map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
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
											Find here
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
						onChange={(e) => setOptions({ ...options, max_sentence_len: parseInt(e.target.value) ?? 1 })}
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
			</div>
		</div>
	)
}
