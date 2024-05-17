import * as shell from '@tauri-apps/plugin-shell'
import { useTranslation } from 'react-i18next'
import { languages } from '~/lib/i18n'
import { cx } from '~/lib/utils'
import * as config from '~/lib/config'
import { useSettingsViewmodel } from './useSettingsViewmodel'
import { Dispatch, SetStateAction } from 'react'
import { InfoTooltip } from '~/components/InfoTooltip'
import { ReactComponent as ChevronLeftIcon } from '~/icons/chevron-left.svg'
import { ReactComponent as ChevronRightIcon } from '~/icons/chevron-right.svg'
interface SettingsPageProps {
    setVisible: Dispatch<SetStateAction<boolean>>
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
    const { t, i18n } = useTranslation()
    const vm = useSettingsViewmodel()

    return (
        <div className="flex flex-col m-auto w-[300px] mt-10 pb-4 dark:font-normal">
            <div className="relative mt-5">
                <button onMouseDown={() => setVisible(false)} className={cx('btn btn-square btn-ghost absolute start-0')}>
                    {i18n.dir() === 'ltr' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                </button>
                <div className="text-4xl text-center">{t('settings')}</div>
            </div>

            <label className="form-control w-full mt-10">
                <div className="label">
                    <span className="label-text">{t('language')}</span>
                </div>
                <select onChange={(e) => vm.setLanguage(e.target.value)} value={t(i18n.language)} className="select select-bordered">
                    <option>{t('select-language')}</option>
                    {Object.keys(languages).map((code, index) => (
                        <option key={index} value={code}>
                            {t(languages[code])}
                        </option>
                    ))}
                </select>
            </label>
            <div className="form-control mt-5">
                <label className="label cursor-pointer">
                    <span className="label-text">{t('play-sound-on-finish')}</span>
                    <input type="checkbox" className="toggle" onChange={(e) => vm.setSoundOnFinish(e.target.checked)} checked={vm.soundOnFinish} />
                </label>
                <label className="label cursor-pointer">
                    <span className="label-text">{t('focus-window-on-finish')}</span>
                    <input type="checkbox" className="toggle" onChange={(e) => vm.setFocusOnFinish(e.target.checked)} checked={vm.focusOnFinish} />
                </label>
            </div>

            <div className="label mt-10">
                <span className="label-text flex items-center gap-1">
                    <InfoTooltip text={t('customize-info')} />
                    {t('customize')}
                </span>
            </div>
            <div className="flex flex-col gap-1">
                <select
                    onFocus={vm.loadModels}
                    onChange={(e) => vm.setModelPath(e.target.value)}
                    value={vm.modelPath}
                    className="select select-bordered flex-1">
                    <option>{t('select-model')}</option>
                    {vm.models.map((model, index) => (
                        <option key={index} value={model.path}>
                            {model.name}
                        </option>
                    ))}
                </select>
                <button onMouseDown={vm.openModelPath} className="btn bg-base-300 text-base-content">
                    {t('open-models-path')}
                </button>
                <button onMouseDown={vm.openModelsUrl} className="btn bg-base-300 text-base-content">
                    {t('download-models-link')}
                </button>
            </div>

            <div className="label mt-10">
                <span className="label-text">{t('general')}</span>
            </div>

            <div className="flex flex-col gap-1">
                <button onMouseDown={() => shell.open(config.aboutURL)} className="btn bg-base-300 text-base-content">
                    {t('project-link')}
                </button>
                <button onMouseDown={vm.reportIssue} className="btn bg-base-300 text-base-content">
                    {t('report-issue')}
                </button>
            </div>

            <div className="label mt-10">
                <span className="label-text">{t('advanced')}</span>
            </div>
            <div className="flex flex-col gap-1">
                <button onMouseDown={vm.openLogsFolder} className="btn bg-base-300 text-base-content">
                    {t('open-logs-folder')}
                </button>
                <button onClick={vm.askAndReset} className="btn">
                    {t('reset-app')}
                </button>
                <p className="text-center font-light mt-2">{vm.appVersion}</p>
            </div>
        </div>
    )
}
