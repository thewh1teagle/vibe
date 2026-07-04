import { message } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	Bot,
	Check,
	Copy,
	Cpu,
	Globe,
	Mic,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Terminal,
	Wrench,
	X,
} from 'lucide-react'
import { useHotkeyProvider, type HotkeyOutputMode } from '~/providers/hotkey'
import { InfoTooltip } from '~/components/info-tooltip'
import LanguageInput from '~/components/language-input'
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
import { ModifyState } from '~/lib/types'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

type SectionId = 'general' | 'transcription' | 'models' | 'summarize' | 'tuning' | 'dictation' | 'api' | 'privacy' | 'advanced'

function SectionCard({ children }: { children: ReactNode }) {
	return <div className="rounded-2xl border border-border/60 bg-card/92 p-5 text-card-foreground shadow-xs">{children}</div>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="w-full space-y-2">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}

export default function SettingsPage({ setVisible, scrollTo }: SettingsPageProps) {
	const { t, i18n } = useTranslation()
	const vm = viewModel()
	const apiDocsUrl = vm.apiBaseUrl ? `${vm.apiBaseUrl}/docs` : null
	const serverActionBusy = vm.isStartingApiServer || vm.isStoppingApiServer
	const hotkey = useHotkeyProvider()
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = {
			CmdOrCtrl: isMac ? '⌘' : 'Ctrl',
			Cmd: '⌘',
			Ctrl: isMac ? '⌃' : 'Ctrl',
			Shift: isMac ? '⇧' : 'Shift',
			Alt: isMac ? '⌥' : 'Alt',
			Option: '⌥',
		}
		return hotkey.hotkeyShortcut.split('+').map((k) => keyMap[k] ?? k)
	}, [hotkey.hotkeyShortcut, isMac])

	const sections: { id: SectionId; label: string; icon: ReactNode }[] = [
		{ id: 'general', label: t('common.general'), icon: <Globe className="h-4 w-4" /> },
		{ id: 'transcription', label: t('common.transcription'), icon: <SlidersHorizontal className="h-4 w-4" /> },
		{ id: 'models', label: t('common.customize'), icon: <Bot className="h-4 w-4" /> },
		{ id: 'summarize', label: t('common.process-with-llm'), icon: <Sparkles className="h-4 w-4" /> },
		{ id: 'dictation', label: t('common.global-dictation'), icon: <Mic className="h-4 w-4" /> },
		{ id: 'tuning', label: t('common.fine-tuning'), icon: <Cpu className="h-4 w-4" /> },
		{ id: 'privacy', label: t('common.privacy'), icon: <ShieldCheck className="h-4 w-4" /> },
		{ id: 'api', label: t('common.api-and-agents'), icon: <Terminal className="h-4 w-4" /> },
		{ id: 'advanced', label: t('common.advanced'), icon: <Wrench className="h-4 w-4" /> },
	]

	const [activeSection, setActiveSection] = useState<SectionId>(
		sections.some((s) => s.id === scrollTo) ? (scrollTo as SectionId) : 'general',
	)

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<div
				onMouseDown={(event) => event.stopPropagation()}
				className="flex h-[640px] w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
				<div className="flex w-56 shrink-0 flex-col border-r border-border/55 bg-muted/40 p-3">
					<div className="mb-2 flex items-center justify-between px-1 pb-1">
						<span className="text-sm font-semibold">{t('common.settings')}</span>
						<Button onMouseDown={() => setVisible(false)} variant="ghost" size="iconSm" className="h-7 w-7 rounded-lg">
							<X className="h-4 w-4" />
						</Button>
					</div>
					<nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
						{sections.map((section) => (
							<button
								key={section.id}
								type="button"
								onClick={() => setActiveSection(section.id)}
								className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
									activeSection === section.id
										? 'bg-primary/10 text-primary'
										: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
								}`}>
								<span className={activeSection === section.id ? 'text-primary' : 'text-muted-foreground'}>{section.icon}</span>
								<span className="truncate">{section.label}</span>
							</button>
						))}
					</nav>
					<p className="mt-2 border-t border-border/55 px-2.5 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
						{vm.appVersion}
					</p>
				</div>

				<div className="min-w-0 flex-1 overflow-y-auto p-6">
					<div className="mb-5 border-b border-border/55 pb-3">
						<h2 className="text-xl font-semibold">{sections.find((s) => s.id === activeSection)?.label}</h2>
					</div>
					{activeSection === 'general' && (
						<div className="space-y-5">
							<SectionCard>
								<div className="grid grid-cols-1 divide-y divide-border/45 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
									<div className="space-y-2 sm:pe-5">
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
									<div className="space-y-2 pt-4 sm:ps-5 sm:pt-0">
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

							<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
								<Button
									variant="ghost"
									onMouseDown={() => openUrl(config.aboutURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.project-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.reportIssue}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.report-issue')} <GithubIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={() => openUrl(config.supportVibeURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.support-the-project')} <HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={() => openUrl(config.discordURL)}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.discord-community')} <DiscordIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</div>
					)}

					{activeSection === 'transcription' && (
						<div className="space-y-5">
							<SectionCard>
								<LanguageInput />
							</SectionCard>
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

							<div className="space-y-2">
								<div className="flex items-center gap-1 px-1">
									<InfoTooltip text={t('common.recording-save-path-info')} />
									<span className="text-sm font-semibold text-foreground/95">{t('common.recording-save-path')}</span>
								</div>
								<SectionCard>
									<div className="flex items-center justify-between gap-2">
										<p className="min-w-0 truncate text-sm text-muted-foreground" title={vm.preference.customRecordingPath ?? vm.defaultRecordingPath}>
											{vm.preference.customRecordingPath ?? vm.defaultRecordingPath}
										</p>
										<div className="flex shrink-0 items-center gap-2">
											{vm.preference.customRecordingPath && (
												<Button variant="ghost" size="sm" onMouseDown={vm.resetRecordingPath}>
													{t('common.reset-to-default')}
												</Button>
											)}
											<Button variant="outline" size="sm" onMouseDown={vm.changeRecordingPath}>
												{t('common.change-recording-path')}
											</Button>
										</div>
									</div>
								</SectionCard>
							</div>
						</div>
					)}

					{activeSection === 'models' && (
						<div className="space-y-5">
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

									{!vm.isMacOS && (
										<div className="space-y-2">
											<Label>{t('common.gpu-device')}</Label>
											{vm.gpuDevices.length > 0 ? (
												<Select
													value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
													onValueChange={(value) => {
														vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
													}}>
													<SelectTrigger>
														<SelectValue placeholder={t('common.gpu-device')} />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="auto">Auto</SelectItem>
														{vm.gpuDevices.map((device) => (
															<SelectItem key={device.index} value={String(device.index)}>
																{device.description}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											) : (
												<Input
													type="number"
													value={vm.preference.gpuDevice ?? ''}
													onChange={(e) => {
														const val = e.target.value
														vm.preference.setGpuDevice(val === '' ? null : parseInt(val, 10))
													}}
													placeholder={t('common.gpu-device-placeholder')}
												/>
											)}
										</div>
									)}

									<div className="space-y-1 pt-1">
										<Button
											variant="ghost"
											onMouseDown={vm.openModelsUrl}
											className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
											{t('common.download-models-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
										</Button>
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
									</div>
								</div>
							</SectionCard>

							<div className="space-y-2">
								<div className="flex items-center gap-1 px-1">
									<InfoTooltip text={t('common.ytdlp-options-info')} />
									<span className="text-sm font-semibold text-foreground/95">{t('common.ytdlp-options')}</span>
								</div>
								<SectionCard>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="text-sm font-medium">{t('common.check-ytdlp-updates')}</span>
										<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
									</div>
								</SectionCard>
							</div>
						</div>
					)}

					{activeSection === 'summarize' && (
						<div className="space-y-5">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<h3 className="text-sm font-semibold">{t('common.process-with-llm')} ✨</h3>
										<InfoTooltip text={t('common.info-llm-summarize')} />
									</div>
									<Switch checked={vm.preference.llmConfig?.enabled} onCheckedChange={vm.onEnableLlm} />
									</div>

									<Field label={t('common.llm-platform')}>
										<Select
											value={vm.preference.llmConfig?.platform}
											onValueChange={(value) => {
												const lang = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language) ?? 'English'
												const defaults =
													value === 'ollama' ? defaultOllamaConfig(lang) : value === 'openai' ? defaultOpenAIConfig(lang) : defaultClaudeConfig(lang)
												vm.preference.setLlmConfig({
													...defaults,
													ollamaBaseUrl: vm.preference.llmConfig.ollamaBaseUrl,
													claudeApiKey: vm.preference.llmConfig.claudeApiKey,
													openaiBaseUrl: vm.preference.llmConfig.openaiBaseUrl,
													openaiApiKey: vm.preference.llmConfig.openaiApiKey,
													enabled: vm.preference.llmConfig?.enabled ?? false,
												})
											}}>
											<SelectTrigger className="capitalize">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{['claude', 'ollama', 'openai'].map((name) => (
													<SelectItem key={name} value={name} className="capitalize">
														{name === 'openai' ? 'OpenAI Compatible' : name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>

									{vm.preference.llmConfig?.platform === 'claude' && (
										<>
											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-llm-api-key')} />
														{t('common.llm-api-key')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl(config.llmApiKeyUrl)}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.claudeApiKey}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, claudeApiKey: e.target.value })}
													placeholder="Paste here your API key"
													type="text"
												/>
											</Field>
											<Field
												label={
													<>
														{t('common.llm-model')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl('https://docs.anthropic.com/en/docs/about-claude/models')}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
													placeholder="claude-sonnet-4-5"
												/>
											</Field>
										</>
									)}

									{vm.preference.llmConfig?.platform === 'ollama' && (
										<>
											<Field label={t('common.ollama-base-url')}>
												<Input
													value={vm.preference.llmConfig?.ollamaBaseUrl}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, ollamaBaseUrl: e.target.value })}
												/>
											</Field>
											<Field
												label={
													<>
														{t('common.llm-model')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl(`https://ollama.com/library/${vm.preference.llmConfig.model}`)}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
												/>
											</Field>
										</>
									)}

									{vm.preference.llmConfig?.platform === 'openai' && (
										<>
											<Field label="Base URL">
												<Input
													value={vm.preference.llmConfig?.openaiBaseUrl}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiBaseUrl: e.target.value })}
													placeholder="https://api.openai.com/v1"
												/>
											</Field>
											<Field label="API Key">
												<Input
													value={vm.preference.llmConfig?.openaiApiKey}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiApiKey: e.target.value })}
													placeholder="sk-... (optional for local servers)"
													type="text"
												/>
											</Field>
											<Field label={t('common.llm-model')}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
													placeholder="gpt-4o-mini"
												/>
											</Field>
										</>
									)}

									<Field
										label={
											<>
												<InfoTooltip text={t('common.info-llm-prompt')} />
												{t('common.llm-prompt')}
											</>
										}>
										<Textarea
											value={vm.preference.llmConfig?.prompt}
											onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, prompt: e.target.value })}
											onBlur={vm.validateLlmPrompt}
											className="min-h-[100px]"
										/>
									</Field>

									<Field
										label={
											<>
												<InfoTooltip text={t('common.info-max-tokens')} />
												{t('common.max-tokens')}
											</>
										}>
										<Input
											type="number"
											onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, maxTokens: vm.parseIntOr(e.target.value, 1) })}
											value={vm.preference.llmConfig?.maxTokens}
										/>
									</Field>

									<Button onClick={vm.checkLlm} size="sm" className="w-full">
										{t('common.run-llm-check')}
									</Button>

									{vm.llmError && (
										<div className="relative rounded-lg border border-destructive/30 bg-destructive/5 p-3 pe-10">
											<button type="button" className="absolute end-2 top-2 p-1 text-muted-foreground hover:text-foreground" onClick={vm.copyLlmError}>
												{vm.llmErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
											</button>
											<pre className="whitespace-pre-wrap break-all text-xs text-destructive">{vm.llmError}</pre>
										</div>
									)}

									{vm.preference.llmConfig?.platform === 'claude' && (
										<div className="flex flex-col gap-2 text-sm">
											<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => openUrl(config.llmLimitsUrl)}>
												{t('common.set-monthly-spend-limit')}
											</button>
											<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => openUrl(config.llmCostUrl)}>
												{t('common.llm-current-cost')}
											</button>
										</div>
									)}
								</div>
							</div>
						)}

					{activeSection === 'tuning' && (
						<div className="space-y-5">
							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{t('common.speaker-timing')}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={t('common.info-diarization')} />
												{t('common.enable-diarization')}
											</span>
											<Switch checked={vm.preference.diarizeEnabled} onCheckedChange={vm.toggleDiarization} />
										</div>
										{vm.preference.diarizeEnabled && (
											<p className="text-sm italic text-muted-foreground">{t('common.diarize-max-speakers-note')}</p>
										)}
										<div className="h-px bg-border/45" />
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text="Uses VAD per-segment decode for tighter subtitle timing. Around 4x slower; best for movie/long-form transcript work." />
												Enable stable timestamps
											</span>
											<Switch checked={vm.preference.stableTimestampsEnabled} onCheckedChange={vm.handleStableTimestampsToggle} />
										</div>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{t('common.model-options')}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={t('common.info-translate-to-english')} />
												{t('common.translate-to-english')}
											</span>
											<Switch
												checked={Boolean(vm.preference.modelOptions.translate)}
												onCheckedChange={(checked) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, translate: checked })}
											/>
										</div>

										<Field
											label={
												<>
													<InfoTooltip text={t('common.info-prompt')} />
													{t('common.prompt')} ({t('common.leftover')} {1024 - (vm.preference.modelOptions?.init_prompt?.length ?? 0)}{' '}
													{t('common.characters')})
												</>
											}>
											<Textarea
												value={vm.preference.modelOptions?.init_prompt}
												onChange={(e) =>
													vm.preference.setModelOptions({ ...vm.preference.modelOptions, init_prompt: e.target.value.slice(0, 1024) })
												}
												className="min-h-[80px]"
											/>
										</Field>

										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={t('common.info-use-word-timestamps')} />
												{t('common.use-word-timestamps')}
											</span>
											<Switch
												checked={Boolean(vm.preference.modelOptions.word_timestamps)}
												onCheckedChange={(checked) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, word_timestamps: checked })}
											/>
										</div>

										<div className="grid grid-cols-2 gap-4">
											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-max-sentence-len')} />
														{t('common.max-sentence-len')}
													</>
												}>
												<Input
													type="number"
													value={vm.preference.modelOptions.max_sentence_len}
													onChange={(e) => {
														if (!vm.preference.modelOptions.word_timestamps) message(t('common.please-enable-word-timestamps'))
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_sentence_len: vm.parseIntOr(e.target.value, 1) })
													}}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-threads')} />
														{t('common.threads')}
													</>
												}>
												<Input
													type="number"
													value={vm.preference.modelOptions.n_threads}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, n_threads: vm.parseIntOr(e.target.value, 1) })
													}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-temperature')} />
														{t('common.temperature')}
													</>
												}>
												<Input
													type="number"
													step={0.1}
													value={vm.preference.modelOptions.temperature}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, temperature: parseFloat(e.target.value) || 0 })
													}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-max-text-ctx')} />
														{t('common.max-text-ctx')}
													</>
												}>
												<Input
													type="number"
													step={1}
													value={vm.preference.modelOptions.max_text_ctx ?? 0}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_text_ctx: vm.parseIntOr(e.target.value, 0) })
													}
												/>
											</Field>
										</div>

										<div className="grid grid-cols-2 gap-4">
											<Field
												label={
													<>
														<InfoTooltip text="Greedy vs Beam Search: Default is Beam Search (Size 5, Patience -1), which evaluates 5 possible sequences at each step for more accurate results, but is slower. Greedy, on the other hand, selects the best token from the top 5 at each step, making it faster but potentially less accurate." />
														{t('common.sampling-strategy')}
													</>
												}>
												<Select
													value={vm.preference.modelOptions.sampling_strategy}
													onValueChange={(value) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, sampling_strategy: value as 'greedy' | 'beam search' })
													}>
													<SelectTrigger className="capitalize">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{['beam search', 'greedy'].map((name) => (
															<SelectItem key={name} value={name} className="capitalize">
																{name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip
															text={
																vm.preference.modelOptions.sampling_strategy === 'greedy'
																	? 'Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower.'
																	: 'Paths explored in Beam Search (default: 5) — higher = better accuracy, slower.'
															}
														/>
														{vm.preference.modelOptions.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}
													</>
												}>
												<Input
													type="number"
													step={1}
													value={
														vm.preference.modelOptions.sampling_strategy === 'greedy'
															? (vm.preference.modelOptions.best_of ?? 5)
															: (vm.preference.modelOptions.beam_size ?? 5)
													}
													onChange={(e) => {
														const val = vm.parseIntOr(e.target.value, 5)
														if (vm.preference.modelOptions.sampling_strategy === 'greedy') {
															vm.preference.setModelOptions({ ...vm.preference.modelOptions, best_of: val })
														} else {
															vm.preference.setModelOptions({ ...vm.preference.modelOptions, beam_size: val })
														}
													}}
												/>
											</Field>
										</div>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{t('common.ffmpeg-options')}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={t('common.info-normalize-loudness')} />
												{t('common.normalize-loudness')}
											</span>
											<Switch
												checked={vm.preference.ffmpegOptions.normalize_loudness}
												onCheckedChange={(checked) =>
													vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, normalize_loudness: checked })
												}
											/>
										</div>

										<Field
											label={
												<>
													<InfoTooltip text={'ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error'} />
													{t('common.custom-ffmpeg-command')}
												</>
											}>
											<Input
												value={vm.preference.ffmpegOptions.custom_command ?? ''}
												onChange={(e) =>
													vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, custom_command: e.target.value || null })
												}
												placeholder={vm.preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : ''}
												type="text"
											/>
										</Field>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{t('common.presets')}</span>
								<SectionCard>
									<div className="flex gap-4">
										<Button variant="secondary" onClick={vm.preference.enableSubtitlesPreset} className="flex-1">
											{t('common.preset-for-subtitles')}
										</Button>
										<Button variant="secondary" onClick={vm.preference.resetOptions} className="flex-1">
											{t('common.reset-options')}
										</Button>
									</div>
								</SectionCard>
							</div>
						</div>
					)}

					{activeSection === 'dictation' && (
						<div className="space-y-5">
							<p className="px-1 text-sm text-muted-foreground">{t('common.global-dictation-promo')}</p>
							<SectionCard>
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{t('common.global-hotkey-enabled')}</span>
										<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
									</div>

									{hotkey.hotkeyEnabled && (
										<>
											<Field
												label={
													<span className="flex items-center gap-2">
														{t('common.global-hotkey-shortcut')}
														<span className="flex items-center gap-1">
															{shortcutKeys.map((key, i) => (
																<kbd
																	key={i}
																	className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-background/70 px-1.5 font-mono text-[11px] font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
																	{key}
																</kbd>
															))}
														</span>
													</span>
												}>
												<Input
													type="text"
													value={hotkey.hotkeyShortcut}
													onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)}
												/>
											</Field>
											<div className="flex gap-2">
												{(['clipboard', 'type'] as HotkeyOutputMode[]).map((mode) => (
													<button
														key={mode}
														type="button"
														onClick={() => hotkey.setHotkeyOutputMode(mode)}
														className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
															hotkey.hotkeyOutputMode === mode
																? 'border-primary bg-primary/10 text-primary'
																: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
														}`}>
														{t(`common.hotkey-output-${mode}`)}
													</button>
												))}
											</div>
											<p className="text-xs italic text-muted-foreground">{t('common.global-hotkey-description')}</p>

											<div className="h-px bg-border/45" />

											<div className="flex items-center justify-between gap-3">
												<span className="flex items-center gap-1 text-sm font-medium">
													<InfoTooltip text={t('common.normalize-hotkey-output-info')} />
													{t('common.normalize-hotkey-output')}
												</span>
												<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
											</div>
										</>
									)}
								</div>
							</SectionCard>
						</div>
					)}

					{activeSection === 'api' && (
						<div className="space-y-5">
							<p className="px-1 text-sm text-muted-foreground">{t('common.api-agents-description')}</p>
							<SectionCard>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2.5">
										<span
											className={`h-2 w-2 rounded-full ${vm.apiBaseUrl ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]' : 'bg-muted-foreground/40 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]'}`}
										/>
										<div>
											<p className="text-sm font-semibold">{vm.apiBaseUrl ? t('common.api-server-running') : t('common.api-server-off')}</p>
											{vm.apiBaseUrl && <p className="text-xs text-muted-foreground">{vm.apiBaseUrl}</p>}
										</div>
									</div>
									<Button
										variant={vm.apiBaseUrl ? 'outline' : 'default'}
										size="sm"
										className="rounded-lg"
										onMouseDown={vm.apiBaseUrl ? vm.stopApiServer : vm.startApiServer}
										disabled={serverActionBusy}>
										{vm.isStartingApiServer
											? t('common.api-starting')
											: vm.isStoppingApiServer
												? t('common.api-stopping')
												: vm.apiBaseUrl
													? t('common.stop')
													: t('common.start')}
									</Button>
								</div>
							</SectionCard>

							<div className={`divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs ${!vm.apiBaseUrl ? 'pointer-events-none opacity-50' : ''}`}>
								<Button
									variant="ghost"
									onMouseDown={() => (apiDocsUrl ? openUrl(apiDocsUrl) : null)}
									disabled={!apiDocsUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.swagger-docs')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.copyCurlExample}
									disabled={!vm.apiBaseUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.copy-curl-example')} <CopyIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.copyAgentSkill}
									disabled={!vm.apiBaseUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.copy-agent-skill')} <Bot className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</div>
					)}

					{activeSection === 'privacy' && (
						<div className="space-y-5">
							<SectionCard>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium">{t('common.analytics-enabled')}</span>
									<Switch checked={vm.preference.analyticsEnabled} onCheckedChange={vm.preference.setAnalyticsEnabled} />
								</div>
								{!vm.preference.analyticsEnabled && (
									<p className="mt-2 text-xs italic text-muted-foreground">{t('common.analytics-disabled-warning')}</p>
								)}
							</SectionCard>
							<Button
								variant="ghost"
								onMouseDown={() => openUrl(config.privacyPolicyURL)}
								className="h-11 w-full justify-between rounded-xl border border-border/55 bg-card/92 px-4 font-medium hover:bg-accent/55">
								{t('common.privacy-policy')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
						</div>
					)}

					{activeSection === 'advanced' && (
						<div className="space-y-5">
							<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
								<Button
									variant="ghost"
									onMouseDown={vm.copyLogs}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.copy-logs')} <CopyIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.revealLogs}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.logs-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.revealTemp}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{t('common.temp-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onClick={vm.askAndReset}
									className="h-12 w-full justify-between rounded-none px-4 font-medium text-destructive first:rounded-t-2xl last:rounded-b-2xl hover:bg-destructive/12 hover:text-destructive">
									{t('common.reset-app')} <ResetIcon className="h-5 w-5" />
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
