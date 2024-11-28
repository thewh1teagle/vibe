import * as shell from '@tauri-apps/plugin-shell'
import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '~/components/InfoTooltip'
import { ReactComponent as ChevronLeftIcon } from '~/icons/chevron-left.svg'
import { ReactComponent as ChevronRightIcon } from '~/icons/chevron-right.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'

import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { ModifyState, cx } from '~/lib/utils'
import { viewModel } from './viewModel'
import * as os from '@tauri-apps/plugin-os'
import { useEffect, useState } from 'react'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
	const { t, i18n } = useTranslation()
	const vm = viewModel()

	const [platform, setPlatform] = useState<os.Platform | null>(null)

	async function getPlatform() {
		setPlatform(os.platform())
	}

	useEffect(() => {
		getPlatform()
	}, [])

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
				<select
					onChange={(e) => {
						vm.preference.setDisplayLanguage(e.target.value)
					}}
					value={vm.preference.displayLanguage}
					className="select select-bordered capitalize">
					<option>{t('common.select-language')}</option>
					{Object.entries(supportedLanguages).map(([code, name], index) => (
						<option key={index} value={code}>
							{code === i18n.language ? t(`language.${name}`) : name}
						</option>
					))}
				</select>
			</label>

			<label className="form-control w-full">
				<div className="label">
					<span className="label-text">{t('common.theme')}</span>
				</div>
				<select
					onChange={(e) => vm.preference.setTheme(e.target.value as any)}
					value={vm.preference.theme}
					className="select select-bordered capitalize">
					<option>{t('common.select-theme')}</option>
					{config.themes.map((theme) => (
						<option key={theme} value={theme}>
							{t(`common.${theme}`)}
						</option>
					))}
				</select>
			</label>

			<div className="label mt-5">
				<span className="label-text opacity-60">{t('common.when-completing-transcription')}</span>
			</div>

			<div className="form-control">
				<label className="label cursor-pointer">
					<span className="label-text">{t('common.play-sound-on-finish')}</span>
					<input
						type="checkbox"
						className="toggle toggle-primary"
						onChange={(e) => vm.preference.setSoundOnFinish(e.target.checked)}
						checked={vm.preference.soundOnFinish}
					/>
				</label>
				<label className="label cursor-pointer">
					<span className="label-text">{t('common.focus-window-on-finish')}</span>
					<input
						type="checkbox"
						className="toggle toggle-primary"
						onChange={(e) => vm.preference.setFocusOnFinish(e.target.checked)}
						checked={vm.preference.focusOnFinish}
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
				<label className="input input-bordered flex items-center gap-2">
					<input
						type="text"
						className="grow"
						value={vm.downloadURL}
						onChange={(event) => vm.setDownloadURL(event.target.value)}
						placeholder={t('common.paste-model-link')}
						onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
					/>
					<svg
						onClick={vm.downloadModel}
						aria-hidden="true"
						focusable="false"
						role="img"
						className="octicon octicon-download cursor-pointer"
						viewBox="0 0 16 16"
						width="16"
						height="16"
						fill="currentColor">
						<path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
						<path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
					</svg>
				</label>
				<select
					onFocus={vm.loadModels}
					onChange={(e) => vm.preference.setModelPath(e.target.value)}
					value={vm.preference.modelPath ?? undefined}
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
				<button onMouseDown={vm.changeModelsFolder} className="btn bg-base-300 text-base-content">
					{t('common.change-models-folder')}
					<WrenchIcon className="h-4 w-4" />
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
				<button onMouseDown={() => shell.open(config.supportVibeURL)} className="btn bg-base-300 text-base-content">
					{t('common.support-the-project')}
					<HeartIcon fill="#db61a2" className="w-4 h-4 stroke-2" />
				</button>
				<button onMouseDown={() => shell.open(config.discordURL)} className="btn bg-base-300 text-base-content">
					{t('common.discord-community')}
					<DiscordIcon className="w-4 h-4" />
				</button>
			</div>

			<div className="label mt-10">
				<span className="label-text">{t('common.advanced')}</span>
			</div>
			<label className="form-control w-full py-2">
				<span className="label-text flex items-center gap-1 cursor-default">
					<InfoTooltip text={t('common.info-gpu-device')} />
					{t('common.gpu-device')}
				</span>
				<input
					value={vm.preference.gpuDevice}
					onChange={(e) => vm.preference.setGpuDevice(parseInt(e.target.value) ?? 0)}
					className="input input-bordered"
					type="number"
				/>
			</label>
			{platform === 'windows' && (
				<div className="form-control w-full mt-3">
					<label className="label cursor-pointer">
						<span className="label-text flex items-center gap-1 cursor-default">
							<InfoTooltip text={t('common.info-high-gpu-performance')} />
							{t('common.high-gpu-performance')}
						</span>

						<input
							type="checkbox"
							className="toggle toggle-primary"
							checked={vm.preference.highGraphicsPreference}
							onChange={() => vm.preference.setHighGraphicsPreference(!vm.preference.highGraphicsPreference)}
						/>
					</label>
				</div>
			)}

			{/* Logs enabled by default currently */}
			{/* <div className="form-control w-full mt-3">
				<label className="label cursor-pointer">
					<span className="label-text flex items-center gap-1 cursor-default">
						<InfoTooltip text={t('common.info-enable-logs')} />
						{t('common.enable-logs')}
					</span>

					<input
						type="checkbox"
						className="toggle toggle-primary"
						checked={vm.isLogToFileSet ?? false}
						onChange={() => vm.setLogToFile(!vm.isLogToFileSet)}
					/>
				</label>
			</div> */}

			<div className="flex flex-col gap-1">
				<button onMouseDown={vm.copyLogs} className="btn bg-base-300 text-base-content">
					{t('common.copy-logs')}
					<CopyIcon className="h-4 w-4" />
				</button>
				<button onMouseDown={vm.revealLogs} className="btn bg-base-300 text-base-content">
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
