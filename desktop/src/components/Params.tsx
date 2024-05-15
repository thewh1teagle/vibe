import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../lib/utils'

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

function Info({ text }: { text: string }) {
    return (
        <div className="tooltip" data-tip={text}>
            <svg
                data-tooltip-place="top"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                />
            </svg>
        </div>
    )
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
                            <Info text={t('info-temperature')} />
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
                            <Info text={t('info-threads')} />
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
                            <Info text={t('info-temperature')} />
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
