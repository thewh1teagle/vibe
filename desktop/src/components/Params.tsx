import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as ChevronDown } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-up.svg'
import { ModifyState, cx } from '~/lib/utils'
import { InfoTooltip } from './InfoTooltip'
import { ModelOptions as IModelOptions } from '~/providers/Preference'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const { t } = useTranslation()
	return (
		<div className={cx('collapse !overflow-visible', open && 'collapse-open')}>
			<div onMouseDown={() => setOpen(!open)} className={cx('mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer')}>
				{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
				{t('common.advanced-options')}
			</div>
			<div className="collapse-content w-full">
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
