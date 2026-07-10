import { openUrl } from '@tauri-apps/plugin-opener'
import { useTranslation } from 'react-i18next'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { SectionCard, type SettingsViewModel } from './shared'

export function GeneralSection({ vm }: { vm: SettingsViewModel }) {
	const { t, i18n } = useTranslation()

	return (
		<div className="space-y-5">
			<SectionCard>
				<div className="grid grid-cols-1 divide-y divide-border/45 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
					<div className="space-y-2 sm:pe-5">
						<Label>{t('common.language')}</Label>
						<Select
							value={supportedLanguages[vm.preference.displayLanguage] ? vm.preference.displayLanguage : 'en-US'}
							onValueChange={vm.preference.setDisplayLanguage}>
							<SelectTrigger className="capitalize"><SelectValue placeholder={t('common.select-language')} /></SelectTrigger>
							<SelectContent>
								{Object.entries(supportedLanguages).map(([code, name]) => (
									<SelectItem key={code} value={code} className="capitalize">
										{code === i18n.language ? t(`language.${name}`) : name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2 pt-4 sm:ps-5 sm:pt-0">
						<Label>{t('common.theme')}</Label>
						<Select value={vm.preference.theme} onValueChange={(value) => vm.preference.setTheme(value as 'light' | 'dark')}>
							<SelectTrigger className="capitalize"><SelectValue placeholder={t('common.select-theme')} /></SelectTrigger>
							<SelectContent>
								{config.themes.map((theme) => <SelectItem key={theme} value={theme} className="capitalize">{t(`common.${theme}`)}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
				</div>
			</SectionCard>

			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={() => openUrl(config.aboutURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{t('common.project-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={vm.reportIssue} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{t('common.report-issue')} <GithubIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.supportVibeURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{t('common.support-the-project')} <HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.discordURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{t('common.discord-community')} <DiscordIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>
		</div>
	)
}
