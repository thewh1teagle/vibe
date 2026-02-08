import * as shell from '@tauri-apps/plugin-shell'
import { ReactNode } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
}

function SectionTitle({ title, tip }: { title: string; tip?: string }) {
	return (
		<div className="mb-3 mt-8 flex items-center gap-1 px-1 first:mt-1">
			{tip ? <InfoTooltip text={tip} /> : null}
			<span className="text-sm font-semibold tracking-wide text-foreground/95">{title}</span>
		</div>
	)
}

function SectionCard({ children }: { children: ReactNode }) {
	return <div className="rounded-xl border border-border/70 bg-card/92 p-4 text-card-foreground shadow-xs">{children}</div>
}

export default function SettingsPage({ setVisible }: SettingsPageProps) {
	const { t, i18n } = useTranslation()
	const vm = viewModel()
	const apiDocsUrl = vm.apiBaseUrl ? `${vm.apiBaseUrl}/docs` : null
	const serverActionBusy = vm.isStartingApiServer || vm.isStoppingApiServer

	return (
		<div className="app-shell flex min-h-screen items-start justify-center py-6 md:py-10">
			<div className="app-panel w-full min-w-0 max-w-3xl dark:shadow-lg">
				<div className="relative mb-4 mt-2 border-b border-border/55 pb-4">
					<Button
						onMouseDown={() => setVisible(false)}
						variant="outline"
						size="iconSm"
						className="absolute start-0 rounded-md border-border/75 bg-background/85 shadow-xs">
						{i18n.dir() === 'ltr' ? <ChevronLeftIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
					</Button>
					<div className="text-center ps-10">
						<p className="app-kicker">{t('common.settings')}</p>
						<div className="text-3xl font-semibold">{t('common.settings')}</div>
					</div>
				</div>

				<div className="mt-7 w-full space-y-7">
					<div className="space-y-2">
						<SectionTitle title={`${t('common.language')} & ${t('common.theme')}`} />
						<SectionCard>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label>{t('common.language')}</Label>
									<Select
										value={supportedLanguages[vm.preference.displayLanguage] ? vm.preference.displayLanguage : 'en-US'}
										onValueChange={(value) => vm.preference.setDisplayLanguage(value)}>
										<SelectTrigger className="capitalize">
											<SelectValue placeholder={t('common.select-language')} />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(supportedLanguages).map(([code, name], index) => (
												<SelectItem key={index} value={code} className="capitalize">
													{code === i18n.language ? t(`language.${name}`) : name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>{t('common.theme')}</Label>
									<Select value={vm.preference.theme} onValueChange={(value) => vm.preference.setTheme(value as 'light' | 'dark')}>
										<SelectTrigger className="capitalize">
											<SelectValue placeholder={t('common.select-theme')} />
										</SelectTrigger>
										<SelectContent>
											{config.themes.map((theme) => (
												<SelectItem key={theme} value={theme} className="capitalize">
													{t(`common.${theme}`)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title={t('common.when-completing-transcription')} />
						<SectionCard>
							<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/45 py-2">
								<span className="text-sm font-medium">{t('common.play-sound-on-finish')}</span>
								<Switch checked={vm.preference.soundOnFinish} onCheckedChange={vm.preference.setSoundOnFinish} />
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2 pb-1 pt-4">
								<span className="text-sm font-medium">{t('common.focus-window-on-finish')}</span>
								<Switch checked={vm.preference.focusOnFinish} onCheckedChange={vm.preference.setFocusOnFinish} />
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title={t('common.customize')} tip={t('common.customize-info')} />
						<SectionCard>
							<div className="space-y-5">
								<div className="space-y-2">
									<Label>{t('common.download-model')}</Label>
									<div className="flex items-center gap-2">
										<Input
											type="text"
											value={vm.downloadURL}
											onChange={(event) => vm.setDownloadURL(event.target.value)}
											placeholder={t('common.paste-model-link')}
											onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
										/>
										<Button variant="default" size="icon" onClick={vm.downloadModel} className="shrink-0">
											<svg
												aria-hidden="true"
												focusable="false"
												role="img"
												className="octicon octicon-download"
												viewBox="0 0 16 16"
												width="16"
												height="16"
												fill="currentColor">
												<path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
												<path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
											</svg>
										</Button>
									</div>
								</div>

								<div className="space-y-2">
									<Label>{t('common.select-model')}</Label>
									<Select
										value={vm.preference.modelPath ?? undefined}
										onValueChange={(value) => vm.preference.setModelPath(value)}
										onOpenChange={(open) => {
											if (open) vm.loadModels()
										}}>
										<SelectTrigger>
											<SelectValue placeholder={t('common.select-model')} />
										</SelectTrigger>
										<SelectContent>
											{vm.models.map((model, index) => (
												<SelectItem key={index} value={model.path}>
													{model.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-1 pt-1">
									<Button
										variant="ghost"
										onMouseDown={vm.openModelPath}
										className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
										{t('common.models-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
									</Button>
									<Button
										variant="ghost"
										onMouseDown={vm.changeModelsFolder}
										className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
										{t('common.change-models-folder')} <WrenchIcon className="h-4 w-4 text-muted-foreground" />
									</Button>
									<Button
										variant="ghost"
										onMouseDown={vm.openModelsUrl}
										className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
										{t('common.download-models-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
									</Button>
								</div>
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title={t('common.ytdlp-options')} tip={t('common.ytdlp-options-info')} />
						<SectionCard>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="text-sm font-medium">{t('common.check-ytdlp-updates')}</span>
								<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title="API Server" />
						<SectionCard>
							<div className="space-y-4">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2 text-sm font-medium">
										<span
											className={`h-2.5 w-2.5 rounded-full ${vm.apiBaseUrl ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]' : 'bg-muted-foreground/40 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]'}`}
										/>
										<span>{vm.apiBaseUrl ? 'Running' : 'Idle'}</span>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onMouseDown={vm.apiBaseUrl ? vm.stopApiServer : vm.startApiServer}
											disabled={serverActionBusy}>
											{vm.isStartingApiServer ? 'Starting...' : vm.isStoppingApiServer ? 'Stopping...' : vm.apiBaseUrl ? 'Stop server' : 'Start server'}
										</Button>
										<Button variant="outline" size="sm" onMouseDown={vm.refreshApiServerStatus}>
											Refresh
										</Button>
									</div>
								</div>
								<div className="rounded-lg border border-border/55 bg-background/30 p-3">
									<p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">API URL</p>
									<p className="truncate font-mono text-xs text-foreground/90">
										{vm.apiBaseUrl ?? 'http://127.0.0.1:<port>'}
									</p>
								</div>
								<Button
									variant="ghost"
									onMouseDown={() => (apiDocsUrl ? shell.open(apiDocsUrl) : null)}
									disabled={!apiDocsUrl}
									className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
									Open API docs <LinkIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title={t('common.general')} />
						<SectionCard>
							<div className="divide-y divide-border/45 rounded-lg border border-border/55 bg-background/20">
								<Button
									variant="ghost"
									onMouseDown={() => shell.open(config.aboutURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.project-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.reportIssue}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.report-issue')} <GithubIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={() => shell.open(config.supportVibeURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.support-the-project')} <HeartIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={() => shell.open(config.discordURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.discord-community')} <DiscordIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</SectionCard>
					</div>

					<div className="space-y-2">
						<SectionTitle title={t('common.advanced')} />
						<SectionCard>
							<div className="divide-y divide-border/45 rounded-lg border border-border/55 bg-background/20">
								<Button
									variant="ghost"
									onMouseDown={vm.copyLogs}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.copy-logs')} <CopyIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.revealLogs}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.logs-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.revealTemp}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-lg last:rounded-b-lg hover:bg-accent/55">
									{t('common.temp-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onClick={vm.askAndReset}
									className="h-12 w-full justify-between rounded-none px-4 font-medium text-destructive first:rounded-t-lg last:rounded-b-lg hover:bg-destructive/12 hover:text-destructive">
									{t('common.reset-app')} <ResetIcon className="h-5 w-5" />
								</Button>
							</div>
						</SectionCard>
						<p className="mt-4 text-center text-xs text-muted-foreground">{vm.appVersion}</p>
					</div>
				</div>
			</div>
		</div>
	)
}
