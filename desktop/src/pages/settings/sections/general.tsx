import { openUrl } from '@tauri-apps/plugin-opener'
import { Moon, Sun } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { DisplayLanguageInput } from '~/components/display-language-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

export function GeneralSection({ vm }: { vm: SettingsViewModel }) {
	const themeLabels = { light: m.light, dark: m.dark } as const
	const themeIcons = { light: Sun, dark: Moon } as const

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow label={m.language()}>
					<DisplayLanguageInput value={vm.preference.displayLanguage} onSelect={vm.preference.setDisplayLanguage} className="w-52" />
				</SettingsRow>
				<SettingsRow label={m.theme()}>
					<Select value={vm.preference.theme} onValueChange={(value) => vm.preference.setTheme(value as 'light' | 'dark')}>
						<SelectTrigger className={`w-36 ${rowControlClass}`}>
							<SelectValue placeholder={m.selectTheme()} />
						</SelectTrigger>
						<SelectContent>
							{config.themes.map((theme) => {
								const Icon = themeIcons[theme as keyof typeof themeIcons]
								return (
									<SelectItem key={theme} value={theme}>
										<span className="flex items-center gap-2">
											{Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
											<span className="capitalize">{themeLabels[theme as keyof typeof themeLabels]()}</span>
										</span>
									</SelectItem>
								)
							})}
						</SelectContent>
					</Select>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup>
				<ActionRow label={m.projectLink()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.aboutURL)} />
				<ActionRow label={m.reportIssue()} icon={<GithubIcon className="h-4 w-4" />} onClick={vm.reportIssue} />
				<ActionRow
					label={m.supportTheProject()}
					icon={<HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />}
					onClick={() => openUrl(config.supportVibeURL)}
				/>
				<ActionRow label={m.discordCommunity()} icon={<DiscordIcon className="h-4 w-4" />} onClick={() => openUrl(config.discordURL)} />
			</SettingsGroup>
		</div>
	)
}
