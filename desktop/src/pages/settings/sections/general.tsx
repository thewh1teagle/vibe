import { openUrl } from '@tauri-apps/plugin-opener'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { getLocalizedLanguageName, supportedLanguages } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { SectionCard, type SettingsViewModel } from './shared'

export function GeneralSection({ vm }: { vm: SettingsViewModel }) {
	const themeLabels = { light: m.light, dark: m.dark } as const

	return (
		<div className="space-y-5">
			<SectionCard>
				<div className="grid grid-cols-1 divide-y divide-border/45 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
					<div className="space-y-2 sm:pe-5">
						<Label>{m.language()}</Label>
						<Select
							value={supportedLanguages[vm.preference.displayLanguage] ? vm.preference.displayLanguage : 'en-US'}
							onValueChange={vm.preference.setDisplayLanguage}>
							<SelectTrigger className="capitalize"><SelectValue placeholder={m.selectLanguage()} /></SelectTrigger>
							<SelectContent>
								{Object.entries(supportedLanguages).map(([code, name]) => (
									<SelectItem key={code} value={code} className="capitalize">
										{code === getLocale() ? getLocalizedLanguageName(name) : name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2 pt-4 sm:ps-5 sm:pt-0">
						<Label>{m.theme()}</Label>
						<Select value={vm.preference.theme} onValueChange={(value) => vm.preference.setTheme(value as 'light' | 'dark')}>
							<SelectTrigger className="capitalize"><SelectValue placeholder={m.selectTheme()} /></SelectTrigger>
							<SelectContent>
								{config.themes.map((theme) => <SelectItem key={theme} value={theme} className="capitalize">{themeLabels[theme as keyof typeof themeLabels]()}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
				</div>
			</SectionCard>

			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={() => openUrl(config.aboutURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.projectLink()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={vm.reportIssue} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.reportIssue()} <GithubIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.supportVibeURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.supportTheProject()} <HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.discordURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.discordCommunity()} <DiscordIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>
		</div>
	)
}
