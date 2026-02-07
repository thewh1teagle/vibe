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
import { ModifyState } from '~/lib/utils'
import { viewModel } from './viewModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { NativeSelect } from '~/components/ui/native-select'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
}

function SectionTitle({ title, tip }: { title: string; tip?: string }) {
	return (
		<div className="flex items-center gap-1 mt-10 mb-2">
			{tip ? <InfoTooltip text={tip} /> : null}
			<span className="text-sm font-medium">{title}</span>
		</div>
	)
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
	const { t, i18n } = useTranslation()
	const vm = viewModel()

	return (
		<div className="flex flex-col m-auto w-[300px] mt-10 pb-4">
			<div className="relative mt-5">
				<Button onMouseDown={() => setVisible(false)} variant="ghost" size="icon" className="absolute start-0">
					{i18n.dir() === 'ltr' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
				</Button>
				<div className="text-4xl text-center">{t('common.settings')}</div>
			</div>

			<div className="space-y-2 w-full mt-10">
				<Label>{t('common.language')}</Label>
				<NativeSelect onChange={(e) => vm.preference.setDisplayLanguage(e.target.value)} value={vm.preference.displayLanguage} className="capitalize">
					<option>{t('common.select-language')}</option>
					{Object.entries(supportedLanguages).map(([code, name], index) => (
						<option key={index} value={code}>
							{code === i18n.language ? t(`language.${name}`) : name}
						</option>
					))}
				</NativeSelect>
			</div>

			<div className="space-y-2 w-full">
				<Label>{t('common.theme')}</Label>
				<NativeSelect onChange={(e) => vm.preference.setTheme(e.target.value as 'light' | 'dark')} value={vm.preference.theme} className="capitalize">
					<option>{t('common.select-theme')}</option>
					{config.themes.map((theme) => (
						<option key={theme} value={theme}>
							{t(`common.${theme}`)}
						</option>
					))}
				</NativeSelect>
			</div>

			<SectionTitle title={t('common.when-completing-transcription')} />
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">{t('common.play-sound-on-finish')}</span>
					<Switch checked={vm.preference.soundOnFinish} onCheckedChange={vm.preference.setSoundOnFinish} />
				</div>
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">{t('common.focus-window-on-finish')}</span>
					<Switch checked={vm.preference.focusOnFinish} onCheckedChange={vm.preference.setFocusOnFinish} />
				</div>
			</div>

			<SectionTitle title={t('common.customize')} tip={t('common.customize-info')} />
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Input
						type="text"
						value={vm.downloadURL}
						onChange={(event) => vm.setDownloadURL(event.target.value)}
						placeholder={t('common.paste-model-link')}
						onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
					/>
					<Button variant="outline" size="icon" onClick={vm.downloadModel}>
						<svg aria-hidden="true" focusable="false" role="img" className="octicon octicon-download" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
							<path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
							<path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
						</svg>
					</Button>
				</div>
				<NativeSelect onFocus={vm.loadModels} onChange={(e) => vm.preference.setModelPath(e.target.value)} value={vm.preference.modelPath ?? undefined}>
					<option>{t('common.select-model')}</option>
					{vm.models.map((model, index) => (
						<option key={index} value={model.path}>
							{model.name}
						</option>
					))}
				</NativeSelect>
				<Button variant="secondary" onMouseDown={vm.openModelPath} className="justify-between">
					{t('common.models-folder')} <FolderIcon className="h-4 w-4" />
				</Button>
				<Button variant="secondary" onMouseDown={vm.changeModelsFolder} className="justify-between">
					{t('common.change-models-folder')} <WrenchIcon className="h-4 w-4" />
				</Button>
				<Button variant="secondary" onMouseDown={vm.openModelsUrl} className="justify-between">
					{t('common.download-models-link')} <LinkIcon className="w-4 h-4" />
				</Button>
			</div>

			<SectionTitle title={t('common.ytdlp-options')} tip={t('common.ytdlp-options-info')} />
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">{t('common.check-ytdlp-updates')}</span>
				<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
			</div>

			<SectionTitle title={t('common.general')} />
			<div className="flex flex-col gap-2">
				<Button variant="secondary" onMouseDown={() => shell.open(config.aboutURL)} className="justify-between">
					{t('common.project-link')} <LinkIcon className="w-4 h-4" />
				</Button>
				<Button variant="secondary" onMouseDown={vm.reportIssue} className="justify-between">
					{t('common.report-issue')} <GithubIcon className="w-4 h-4" />
				</Button>
				<Button variant="secondary" onMouseDown={() => shell.open(config.supportVibeURL)} className="justify-between">
					{t('common.support-the-project')} <HeartIcon fill="#db61a2" className="w-4 h-4 stroke-2" />
				</Button>
				<Button variant="secondary" onMouseDown={() => shell.open(config.discordURL)} className="justify-between">
					{t('common.discord-community')} <DiscordIcon className="w-4 h-4" />
				</Button>
			</div>

			<SectionTitle title={t('common.advanced')} />
			<div className="flex flex-col gap-2">
				<Button variant="secondary" onMouseDown={vm.copyLogs} className="justify-between">
					{t('common.copy-logs')} <CopyIcon className="h-4 w-4" />
				</Button>
				<Button variant="secondary" onMouseDown={vm.revealLogs} className="justify-between">
					{t('common.logs-folder')} <FolderIcon className="h-4 w-4" />
				</Button>
				<Button variant="secondary" onMouseDown={vm.revealTemp} className="justify-between">
					{t('common.temp-folder')} <FolderIcon className="h-4 w-4" />
				</Button>
				<Button variant="destructive" onClick={vm.askAndReset} className="justify-between">
					{t('common.reset-app')} <ResetIcon className="h-5 w-5" />
				</Button>
				<p className="text-center font-light mt-2">{vm.appVersion}</p>
			</div>
		</div>
	)
}
