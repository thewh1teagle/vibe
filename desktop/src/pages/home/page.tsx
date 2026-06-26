import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { webviewWindow } from '@tauri-apps/api'
import { Mic, Radio, Keyboard, Settings2, Wand2 } from 'lucide-react'
import Layout from '~/components/layout'
import LanguageInput from '~/components/language-input'
import ModelOptions from '~/components/params'
import SettingsModal from '~/components/settings-modal'
import { useHotkeyProvider, type HotkeyOutputMode } from '~/providers/hotkey'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Separator } from '~/components/ui/separator'
import { viewModel } from './view-model'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()
	const hotkey = useHotkeyProvider()
	const [settingsOpen, setSettingsOpen] = useState(false)

	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = { CmdOrCtrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt' }
		return hotkey.hotkeyShortcut.split('+').map((k) => keyMap[k] ?? k)
	}, [hotkey.hotkeyShortcut])

	async function showWindow() {
		const currentWindow = webviewWindow.getCurrentWebviewWindow()
		await currentWindow.show()
		if (import.meta.env.PROD) await currentWindow.setFocus()
	}

	useEffect(() => {
		showWindow()
	}, [])

	return (
		<Layout>
			<SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
			<div className="w-full space-y-4">
				{vm.preference.transcriptionProvider === 'local' && !vm.preference.modelPath && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-xs text-destructive/80">
						{t('common.no-model-selected')}
					</div>
				)}

				<div className="flex items-end gap-3">
					<div className="flex-1">
						<LanguageInput />
					</div>
					<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
					<Button
						variant="ghost"
						className="shrink-0 h-9 w-9 rounded-md border border-border/65 text-muted-foreground hover:bg-accent/45 hover:text-foreground"
						aria-label={t('common.settings')}
						onClick={() => setSettingsOpen(true)}>
						<Settings2 className="h-4 w-4" />
					</Button>
				</div>

				<Separator />

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
							<Mic className="h-4 w-4 text-primary" />
						</div>
						<div>
							<h2 className="text-sm font-semibold">{t('common.global-dictation')}</h2>
							<p className="text-[11px] text-muted-foreground">
								{vm.isModelPreloading
									? t('common.model-loading', 'Loading model...')
									: hotkey.hotkeyEnabled
										? t('common.global-hotkey-description')
										: t('common.global-dictation-promo-short', 'Press the hotkey and speak')}
							</p>
						</div>
					</div>
					<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
				</div>

				{hotkey.hotkeyEnabled && (
					<div className="space-y-3 rounded-lg border border-border/40 bg-background/50 p-4">
						<div className="space-y-1.5">
							<label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
								<Keyboard className="h-3 w-3" />
								{t('common.global-hotkey-shortcut')}
							</label>
							<div className="flex items-center gap-2">
								<div className="flex items-center gap-1">
									{shortcutKeys.map((key, i) => (
										<kbd
											key={i}
											className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[11px] font-medium text-foreground/80">
											{key}
										</kbd>
									))}
								</div>
								<Input
									type="text"
									value={hotkey.hotkeyShortcut}
									onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)}
									className="h-7 flex-1 text-xs text-muted-foreground"
								/>
							</div>
						</div>

						<div className="space-y-1.5">
							<label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
								<Radio className="h-3 w-3" />
								Output
							</label>
							<div className="flex gap-1.5">
								{(['clipboard', 'type'] as HotkeyOutputMode[]).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => hotkey.setHotkeyOutputMode(mode)}
										className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
											hotkey.hotkeyOutputMode === mode
												? 'border-primary/40 bg-primary/8 text-primary shadow-sm'
												: 'border-border/50 bg-background/30 text-muted-foreground hover:bg-accent/30 hover:text-foreground'
										}`}>
										{t(`common.hotkey-output-${mode}`)}
									</button>
								))}
							</div>
						</div>

						{hotkey.hotkeyOutputMode === 'clipboard' && (
							<div className="flex items-center justify-between">
								<label className="text-[11px] font-medium text-muted-foreground">{t('common.raw-output', 'Raw text (no line breaks)')}</label>
								<Switch checked={vm.preference.rawOutput} onCheckedChange={vm.preference.setRawOutput} />
							</div>
						)}

						{vm.preference.transcriptionProvider === 'groq' && (
							<div className="flex items-center justify-between">
								<label className="text-[11px] font-medium text-muted-foreground">{t('common.llm-cleanup', 'AI cleanup (Groq only)')}</label>
								<Switch checked={vm.preference.llmCleanup} onCheckedChange={vm.preference.setLlmCleanup} />
							</div>
						)}
					</div>
				)}

				{vm.preference.transcriptionProvider === 'groq' && vm.preference.groqApiKey && (
					<>
						<Separator />
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
									<Wand2 className="h-4 w-4 text-primary" />
								</div>
								<div>
									<h2 className="text-sm font-semibold">{t('common.fix-text', 'Fix text')}</h2>
									<p className="text-[11px] text-muted-foreground">
										{hotkey.isFixTextProcessing
											? t('common.fix-text-processing', 'Processing...')
											: t('common.fix-text-description', 'Copy text, press hotkey, get corrected text')}
									</p>
								</div>
							</div>
							<Switch checked={vm.preference.fixTextEnabled} onCheckedChange={vm.preference.setFixTextEnabled} />
						</div>

						{vm.preference.fixTextEnabled && (
							<div className="space-y-3 rounded-lg border border-border/40 bg-background/50 p-4">
								<div className="space-y-1.5">
									<label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
										<Keyboard className="h-3 w-3" />
										{t('common.fix-text-shortcut', 'Hotkey')}
									</label>
									<div className="flex items-center gap-2">
										<div className="flex items-center gap-1">
											{vm.preference.fixTextShortcut
												.split('+')
												.map((k: string) => ({ CmdOrCtrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt' })[k] ?? k)
												.map((key: string, i: number) => (
													<kbd
														key={i}
														className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[11px] font-medium text-foreground/80">
														{key}
													</kbd>
												))}
										</div>
										<Input
											type="text"
											value={vm.preference.fixTextShortcut}
											onChange={(e) => vm.preference.setFixTextShortcut(e.target.value)}
											className="h-7 flex-1 text-xs text-muted-foreground"
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<label className="text-[11px] font-medium text-muted-foreground">{t('common.fix-text-mode', 'Mode')}</label>
									<div className="flex gap-1.5">
										{[
											{ id: 'fix', label: t('common.fix-mode-fix', 'Fix errors') },
											{ id: 'improve', label: t('common.fix-mode-improve', 'Improve') },
											{ id: 'formal', label: t('common.fix-mode-formal', 'Formal') },
											{ id: 'casual', label: t('common.fix-mode-casual', 'Casual') },
										].map((mode) => (
											<button
												key={mode.id}
												type="button"
												onClick={() => vm.preference.setFixTextMode(mode.id)}
												className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
													vm.preference.fixTextMode === mode.id
														? 'border-primary/40 bg-primary/8 text-primary shadow-sm'
														: 'border-border/50 bg-background/30 text-muted-foreground hover:bg-accent/30 hover:text-foreground'
												}`}>
												{mode.label}
											</button>
										))}
									</div>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</Layout>
	)
}
