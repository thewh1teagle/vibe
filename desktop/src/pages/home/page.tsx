import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { webviewWindow } from '@tauri-apps/api'
import { Mic, Settings2 } from 'lucide-react'
import Layout from '~/components/layout'
import LanguageInput from '~/components/language-input'
import ModelOptions from '~/components/params'
import SettingsModal from '~/components/settings-modal'
import { useHotkeyProvider, type HotkeyOutputMode } from '~/providers/hotkey'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { viewModel } from './view-model'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()
	const hotkey = useHotkeyProvider()
	const [settingsOpen, setSettingsOpen] = useState(false)

	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = { CmdOrCtrl: 'Ctrl', Cmd: 'Ctrl', Ctrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Option: 'Alt' }
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
			<div className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-3">
				{!vm.preference.modelPath && (
					<p className="text-center text-xs text-muted-foreground">{t('common.no-model-selected')}</p>
				)}
				<div className="flex items-end gap-2">
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

				<div className="space-y-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Mic className="h-3.5 w-3.5 text-muted-foreground" />
							<span className="text-xs font-medium">{t('common.global-dictation')}</span>
						</div>
						<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
					</div>

					{hotkey.hotkeyEnabled && (
						<>
							<div className="flex items-center gap-2">
								<div className="flex items-center gap-1">
									{shortcutKeys.map((key, i) => (
										<kbd
											key={i}
											className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/70 bg-background/70 px-1 font-mono text-[10px] font-medium text-foreground/70">
											{key}
										</kbd>
									))}
								</div>
								<Input
									type="text"
									value={hotkey.hotkeyShortcut}
									onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)}
									className="h-6 flex-1 text-[11px] text-muted-foreground"
								/>
							</div>
							<div className="flex gap-1">
								{(['clipboard', 'type'] as HotkeyOutputMode[]).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => hotkey.setHotkeyOutputMode(mode)}
										className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
											hotkey.hotkeyOutputMode === mode
												? 'border-primary/50 bg-primary/10 text-primary'
												: 'border-border/50 bg-background/40 text-muted-foreground hover:bg-accent/30'
										}`}>
										{t(`common.hotkey-output-${mode}`)}
									</button>
								))}
							</div>
						</>
					)}
				</div>
			</div>
		</Layout>
	)
}
