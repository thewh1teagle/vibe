import { useMemo } from 'react'
import { m } from '~/paraglide/messages.js'
import { useHotkeyProvider } from '~/providers/hotkey'
import { openSettingsSection } from '~/lib/app'
import { Mic, Settings2 } from 'lucide-react'

export default function DictationPromo() {
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

	if (!hotkey.hotkeyEnabled) {
		return (
			<button
				type="button"
				onClick={() => openSettingsSection('dictation')}
				className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50">
				<Mic className="h-4 w-4 shrink-0" />
				<span>{m.globalDictationPromoShort()}</span>
				<span className="ml-auto text-xs text-muted-foreground/70">{m.setup()} →</span>
			</button>
		)
	}

	return (
		<button
			type="button"
			onClick={() => openSettingsSection('dictation')}
			className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/[0.06]">
			<Mic className="h-4 w-4 shrink-0" />
			<span className="font-medium">{m.globalDictation()}</span>
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
	)
}
