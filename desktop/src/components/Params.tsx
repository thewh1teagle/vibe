import { ChangeEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as ChevronDown } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-up.svg'
import { ModifyState, cx } from '~/lib/utils'
import { InfoTooltip } from './InfoTooltip'
import { ModelOptions as IModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { useToastProvider } from '~/providers/Toast'
import { listen } from '@tauri-apps/api/event'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const { recognizeSpeakers: _, setRecognizeSpeakers } = usePreferenceProvider()
	const { t } = useTranslation()
	const toast = useToastProvider()

	async function askForSetupDiarize() {
		const confirmed = await ask(t('common.ask-for-setup-diarize'), { title: t('common.setup-diarize-title') })
		if (confirmed) {
			// Download diarization models
			toast.setMessage(t('common.downloading-ai-models'))
			toast.setOpen(true)
			toast.setProgress(0)
			await invoke('download_diarization_models')
			toast.setOpen(false)
			setRecognizeSpeakers(true)
		}
	}

	async function handleProgressEvents() {
		listen<[number, number]>('download_progress', (event) => {
			// event.event is the event name (useful if you want to use a single callback fn for multiple event types)
			// event.payload is the payload object
			const [current, total] = event.payload
			const newDownloadProgress = Number(current / total) * 100
			toast.setProgress(newDownloadProgress)
		})
	}

	async function onRecognizeSpeakerChange(event: ChangeEvent<HTMLInputElement>) {
		const enabled = event.target.checked
		if (enabled) {
			const diarizeAvailable = await invoke<boolean>('is_diarization_available')
			if (diarizeAvailable) {
				setRecognizeSpeakers(true)
			} else {
				await askForSetupDiarize()
			}
		} else {
			setRecognizeSpeakers(false)
		}
	}

	useEffect(() => {
		handleProgressEvents()
	}, [])

	return (
		<div className={cx('collapse !overflow-visible', open && 'collapse-open')}>
			<div onMouseDown={() => setOpen(!open)} className={cx('mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer')}>
				{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
				{t('common.more-options')}
			</div>
			<div className="collapse-content w-full">
				{/* <div className="form-control w-full mt-3">
					<label className="label cursor-pointer">
						<span className="label-text flex items-center gap-1 cursor-default">
							<InfoTooltip text={t('common.info-recognize-speakers')} />
							{t('common.recognize-speakers')}
						</span>
						<input type="checkbox" className="toggle toggle-primary" checked={recognizeSpeakers} onChange={onRecognizeSpeakerChange} />
					</label>
				</div> */}
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
