import * as shell from '@tauri-apps/plugin-shell'
import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '~/components/InfoTooltip'
import { ReactComponent as ChevronLeftIcon } from '~/icons/chevron-left.svg'
import { ReactComponent as ChevronRightIcon } from '~/icons/chevron-right.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { cx } from '~/lib/utils'
import { viewModel } from './viewModel'

interface SettingsPageProps {
	setVisible: Dispatch<SetStateAction<boolean>>
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
	const { t, i18n } = useTranslation()
	const vm = viewModel()
	return (
		<div className="flex flex-col m-auto w-[300px] mt-10 pb-4 dark:font-normal">
			<div className="relative mt-5">
				<button onMouseDown={() => setVisible(false)} className={cx('btn btn-square btn-ghost absolute start-0')}>
					{i18n.dir() === 'ltr' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
				</button>
				<div className="text-4xl text-center">{t('common.settings')}</div>
			</div>

			<label className="form-control w-full mt-10">
				<div className="label">
					<span className="label-text">{t('common.language')}</span>
				</div>
				<select onChange={(e) => vm.prefsSetLanguage(e.target.value)} value={t(i18n.language)} className="select select-bordered capitalize">
					<option>{t('common.select-language')}</option>
					{Object.entries(supportedLanguages).map(([code, name], index) => (
						<option key={index} value={code}>
							{code === i18n.language ? t(`language.${name}`) : name}
						</option>
					))}
				</select>
			</label>
			<div className="form-control mt-5">
				<label className="label cursor-pointer">
					<span className="label-text">{t('common.play-sound-on-finish')}</span>
					<input
						type="checkbox"
						className="toggle toggle-primary"
						onChange={(e) => vm.setPrefsSoundOnFinish(e.target.checked)}
						checked={vm.prefsSoundOnFinish}
					/>
				</label>
				<label className="label cursor-pointer">
					<span className="label-text">{t('common.focus-window-on-finish')}</span>
					<input
						type="checkbox"
						className="toggle toggle-primary"
						onChange={(e) => vm.setPrefsFocusOnFinish(e.target.checked)}
						checked={vm.prefsFocusOnFinish}
					/>
				</label>
			</div>

			<div className="label mt-10">
				<span className="label-text flex items-center gap-1">
					<InfoTooltip text={t('common.customize-info')} />
					{t('common.customize')}
				</span>
			</div>
			<div className="flex flex-col gap-1">
				<select
					onFocus={vm.loadModels}
					onChange={(e) => vm.setModelPath(e.target.value)}
					value={vm.modelPath}
					className="select select-bordered flex-1">
					<option>{t('common.select-model')}</option>
					{vm.models.map((model, index) => (
						<option key={index} value={model.path}>
							{model.name}
						</option>
					))}
				</select>
				<button onMouseDown={vm.openModelPath} className="btn bg-base-300 text-base-content">
					{t('common.models-folder')}
					<FolderIcon className="h-4 w-4" />
				</button>
				<button onMouseDown={vm.openModelsUrl} className="btn bg-base-300 text-base-content">
					{t('common.download-models-link')}
					<LinkIcon className="w-4 h-4" />
				</button>
			</div>

			<div className="label mt-10">
				<span className="label-text">{t('common.general')}</span>
			</div>

			<div className="flex flex-col gap-1">
				<button onMouseDown={() => shell.open(config.aboutURL)} className="btn bg-base-300 text-base-content">
					{t('common.project-link')}
					<LinkIcon className="w-4 h-4" />
				</button>
				<button onMouseDown={vm.reportIssue} className="btn bg-base-300 text-base-content">
					{t('common.report-issue')}
					<GithubIcon className="w-4 h-4" />
				</button>
			</div>

			<div className="label mt-10">
				<span className="label-text">{t('common.advanced')}</span>
			</div>
			<div className="flex flex-col gap-1">
				<button onMouseDown={vm.openLogsFolder} className="btn bg-base-300 text-base-content">
					{t('common.logs-folder')}
					<FolderIcon className="h-4 w-4" />
				</button>
				<button onClick={vm.askAndReset} className="btn bg-base-300">
					{t('common.reset-app')}
					<ResetIcon className="h-5 w-5" />
				</button>
				<p className="text-center font-light mt-2">{vm.appVersion}</p>
			</div>
		</div>
	)
}
