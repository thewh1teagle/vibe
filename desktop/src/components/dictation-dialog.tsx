import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useHotkeyProvider, type HotkeyOutputMode, type HotkeyMode } from '~/providers/hotkey'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Switch } from '~/components/ui/switch'
import { Mic, Settings2 } from 'lucide-react'

const CODE_TO_KEY_NAME: Record<string, string> = {
	KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
	KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
	KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
	KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
	KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
	Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
	Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
	F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5',
	F6: 'F6', F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10',
	F11: 'F11', F12: 'F12',
	Space: 'Space', Enter: 'Enter', Tab: 'Tab', Escape: 'Escape',
	Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End',
	PageUp: 'PageUp', PageDown: 'PageDown',
	ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
	Insert: 'Insert', CapsLock: 'CapsLock', NumLock: 'NumLock', ScrollLock: 'ScrollLock',
	ControlLeft: 'ControlLeft', ControlRight: 'ControlRight',
	ShiftLeft: 'ShiftLeft', ShiftRight: 'ShiftRight',
	AltLeft: 'AltLeft', AltRight: 'AltRight',
	MetaLeft: 'MetaLeft', MetaRight: 'MetaRight',
}

function domEventToShortcut(e: React.KeyboardEvent | KeyboardEvent): string | null {
	const isModifierKey = [
		'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
		'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
	].includes(e.code)

	// Single modifier keys are supported via native hook (Windows only)
	if (isModifierKey) {
		return CODE_TO_KEY_NAME[e.code] ?? null
	}

	const parts: string[] = []
	if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl')
	if (e.shiftKey) parts.push('Shift')
	if (e.altKey) parts.push('Alt')

	const keyName = CODE_TO_KEY_NAME[e.code]
	if (!keyName) return null

	parts.push(keyName)
	return parts.join('+')
}





export default function DictationDialog() {
	const { t } = useTranslation()
	const hotkey = useHotkeyProvider()
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)

	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = {
			CmdOrCtrl: isMac ? '\u2318' : 'Ctrl',
			Cmd: '\u2318',
			Ctrl: isMac ? '\u2325' : 'Ctrl',
			Shift: isMac ? '\u21E7' : 'Shift',
			Alt: isMac ? '\u2325' : 'Alt',
			Option: '\u2325',
			ControlLeft: isMac ? 'L-\u2303' : 'L-Ctrl',
			ControlRight: isMac ? 'R-\u2303' : 'R-Ctrl',
			ShiftLeft: isMac ? 'L-\u21E7' : 'L-Shift',
			ShiftRight: isMac ? 'R-\u21E7' : 'R-Shift',
			AltLeft: isMac ? 'L-\u2325' : 'L-Alt',
			AltRight: isMac ? 'R-\u2325' : 'R-Alt',
			MetaLeft: isMac ? 'L-\u2318' : 'L-Win',
			MetaRight: isMac ? 'R-\u2318' : 'R-Win',
			Space: 'Space',
			Enter: 'Enter',
			Tab: 'Tab',
			Escape: 'Esc',
			Backspace: isMac ? '\u232B' : '\u2190',
			Delete: 'Del',
		}
		return hotkey.hotkeyShortcut.split('+').map((k) => keyMap[k] ?? k)
	}, [hotkey.hotkeyShortcut, isMac])

	const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent) => {
		e.preventDefault()
		e.stopPropagation()
		const shortcut = domEventToShortcut(e)
		if (shortcut) {
			hotkey.setHotkeyShortcut(shortcut)
			setIsRecordingShortcut(false)
		}
	}, [hotkey])

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
								{isRecordingShortcut ? (
									<div
										tabIndex={0}
										autoFocus
										onKeyDown={handleShortcutKeyDown}
										onBlur={() => setIsRecordingShortcut(false)}
										className="flex h-9 items-center justify-center rounded-md border-2 border-primary bg-primary/5 px-3 text-sm font-medium text-primary animate-pulse cursor-pointer"
									>
										{t('common.hotkey-press-shortcut')}
									</div>
								) : (
									<button
										type="button"
										onClick={() => setIsRecordingShortcut(true)}
										className="flex h-9 w-full items-center justify-center rounded-md border border-border/70 bg-background/50 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/40"
									>
										{t('common.hotkey-record-shortcut')}
									</button>
								)}
							</div>

							<div className="space-y-1.5">
								<span className="text-xs text-muted-foreground">{t('common.hotkey-mode-label')}:</span>
								<div className="flex gap-2">
									{(['hold', 'toggle'] as HotkeyMode[]).map((mode) => (
										<button
											key={mode}
											type="button"
											onClick={() => hotkey.setHotkeyMode(mode)}
											className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
												hotkey.hotkeyMode === mode
													? 'border-primary bg-primary/10 text-primary'
													: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
											}`}>
											{t(`common.hotkey-mode-${mode}`)}
										</button>
									))}
								</div>
								<p className="text-[11px] italic text-muted-foreground/70">
									{t(`common.hotkey-mode-${hotkey.hotkeyMode}-info`)}
								</p>
							</div>

							<div className="space-y-1.5">
								<span className="text-xs text-muted-foreground">{t('common.hotkey-output-mode')}:</span>
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