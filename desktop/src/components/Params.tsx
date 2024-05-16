import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../lib/utils'
import { InfoTooltip } from './InfoTooltip'

export interface LocalModelArgs {
    lang?: string
    verbose: boolean
    n_threads?: number
    init_prompt?: string
    temperature?: number
}

interface ParamsProps {
    args: LocalModelArgs
    setArgs: React.Dispatch<React.SetStateAction<LocalModelArgs>>
}

export default function Params({ args, setArgs }: ParamsProps) {
    const [open, setOpen] = useState(false)
    const { t } = useTranslation()
    return (
        <div className={cx('collapse !overflow-visible', open && 'collapse-open')}>
            <div onMouseDown={() => setOpen(!open)} className={cx('mt-3 flex flex-row items-center gap-1 text-sm text-primary font-medium cursor-pointer')}>
                {open ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                )}
                {t('advanced-options')}
            </div>
            <div className="collapse-content w-full">
                <label className="form-control w-full">
                    <div className="label">
                        <span className="label-text flex items-center gap-1">
                            <InfoTooltip text={t('info-prompt')} />
                            {t('prompt')} ({t('leftover')} {1024 - (args?.init_prompt?.length ?? 0)} {t('characters')})
                        </span>
                    </div>
                    <textarea
                        value={args?.init_prompt}
                        onChange={(e) => setArgs({ ...args, init_prompt: e.target.value.slice(0, 1024) })}
                        className="textarea textarea-bordered w-full"></textarea>
                </label>
                <label className="form-control w-full">
                    <div className="label">
                        <span className="label-text flex items-center gap-1">
                            <InfoTooltip text={t('info-threads')} />
                            {t('threads')}
                        </span>
                    </div>
                    <input
                        value={args.n_threads}
                        onChange={(e) => setArgs({ ...args, n_threads: parseInt(e.target.value) })}
                        className="input input-bordered"
                        type="number"
                    />
                </label>
                <label className="form-control w-full">
                    <div className="label">
                        <span className="label-text flex items-center gap-1">
                            <InfoTooltip text={t('info-temperature')} />
                            {t('temperature')}
                        </span>
                    </div>
                    <input
                        step={0.1}
                        value={args.temperature}
                        onChange={(e) => setArgs({ ...args, temperature: parseFloat(e.target.value) })}
                        className="input input-bordered"
                        type="number"
                        defaultValue={0}
                    />
                </label>
            </div>
        </div>
    )
}
