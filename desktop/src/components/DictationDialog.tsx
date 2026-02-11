import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useHotkeyProvider, type HotkeyOutputMode } from '~/providers/Hotkey'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Switch } from '~/components/ui/switch'
import { Input } from '~/components/ui/input'
import { Mic, Settings2 } from 'lucide-react'

export default function DictationDialog() {
	const { t } = useTranslation()
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

	return (
		<Dialog>
			<DialogTrigger asChild>
				{!hotkey.hotkeyEnabled ? (
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50">
						<Mic className="h-4 w-4 shrink-0" />
						<span>{t('common.global-dictation-promo-short', 'Try Global Dictation')}</span>
						<span className="ml-auto text-xs text-muted-foreground/70">{t('common.setup', 'Setup')} →</span>
					</button>
				) : (
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/[0.06]">
						<Mic className="h-4 w-4 shrink-0" />
						<span className="font-medium">{t('common.global-dictation')}</span>
						<div className="ml-auto flex items-center gap-1.5">
							{shortcutKeys.map((key, i) => (
								<kbd
									key={i}
									className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-background/70 px-1.5 font-mono text-[11px] font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
									{key}
								</kbd>
							))}
							<Settings2 className="ml-1 h-3.5 w-3.5 text-muted-foreground/70" />
						</div>
					</button>
				)}
			</DialogTrigger>
			<DialogContent className="max-w-md rounded-2xl border-border/60 bg-card/95 p-6 shadow-xl">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">{t('common.global-dictation')}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 pt-2">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">{t('common.global-hotkey-enabled')}</span>
						<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
					</div>

					{hotkey.hotkeyEnabled && (
						<>
							<div className="space-y-1.5">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">{t('common.global-hotkey-shortcut')}:</span>
									<div className="flex items-center gap-1">
										{shortcutKeys.map((key, i) => (
											<kbd
												key={i}
												className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/80 bg-background/70 px-2 font-mono text-xs font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
												{key}
											</kbd>
										))}
									</div>
								</div>
								<Input
									type="text"
									value={hotkey.hotkeyShortcut}
									onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)}
									className="h-7 text-xs text-muted-foreground"
								/>
							</div>
							<div className="flex gap-2">
								{(['clipboard', 'type'] as HotkeyOutputMode[]).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => hotkey.setHotkeyOutputMode(mode)}
										className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
											hotkey.hotkeyOutputMode === mode
												? 'border-primary bg-primary/10 text-primary'
												: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
										}`}>
										{t(`common.hotkey-output-${mode}`)}
									</button>
								))}
							</div>
							<p className="text-[11px] italic text-muted-foreground/70">{t('common.global-hotkey-description')}</p>
						</>
					)}

					{!hotkey.hotkeyEnabled && (
						<p className="text-xs text-muted-foreground">{t('common.global-dictation-promo')}</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
