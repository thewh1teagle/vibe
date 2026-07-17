import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { SectionCard, SegmentedControl } from './shared'
import { getDictationIndicatorEnabled, setDictationIndicatorEnabled } from '~/lib/dictation-indicator'
import { isAccessibilityGranted, requestAccessibility, ensureMicrophonePermission } from '~/lib/permissions'
import { Button } from '~/components/ui/button'
import { Check } from 'lucide-react'

export function DictationSection() {
	const hotkey = useHotkeyProvider()
	const [indicatorEnabled, setIndicatorEnabled] = useState(true)
	useEffect(() => {
		getDictationIndicatorEnabled().then(setIndicatorEnabled).catch(console.error)
	}, [])

	// Accessibility permission (needed for "Type at cursor"). Re-check on mount
	// and whenever the window regains focus, since granting happens in System
	// Settings outside the app.
	const [accessibilityGranted, setAccessibilityGranted] = useState(true)
	const [accessibilityRequested, setAccessibilityRequested] = useState(false)
	useEffect(() => {
		const check = () => isAccessibilityGranted().then(setAccessibilityGranted).catch(console.error)
		check()
		window.addEventListener('focus', check)
		return () => window.removeEventListener('focus', check)
	}, [])

	async function toggleHotkeyEnabled(enabled: boolean) {
		hotkey.setHotkeyEnabled(enabled)
		// Dictation records from the microphone — request that permission up front
		// so the first shortcut press works instead of failing silently.
		if (enabled) ensureMicrophonePermission().catch(console.error)
	}

	async function selectOutputMode(mode: HotkeyOutputMode) {
		hotkey.setHotkeyOutputMode(mode)
		if (mode === 'type') {
			const granted = await requestAccessibility()
			setAccessibilityGranted(granted)
			if (!granted) setAccessibilityRequested(true)
		}
	}
	async function changeIndicatorEnabled(enabled: boolean) {
		setIndicatorEnabled(enabled)
		try {
			await setDictationIndicatorEnabled(enabled)
		} catch (error) {
			setIndicatorEnabled(!enabled)
			console.error(error)
		}
	}
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	const activationLabels = {
		'push-to-talk': m.hotkeyActivationPushToTalk,
		toggle: m.hotkeyActivationToggle,
	} as const
	const activationDescriptions = {
		'push-to-talk': m.hotkeyActivationPushToTalkDescription,
		toggle: m.hotkeyActivationToggleDescription,
	} as const
	const outputLabels = {
		clipboard: m.hotkeyOutputClipboard,
		type: m.hotkeyOutputType,
	} as const
	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = { CmdOrCtrl: isMac ? '⌘' : 'Ctrl', Cmd: '⌘', Ctrl: isMac ? '⌃' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Option: '⌥' }
		return hotkey.hotkeyShortcut.split('+').map((key) => keyMap[key] ?? key)
	}, [hotkey.hotkeyShortcut, isMac])
	return (
		<div className="space-y-5">
			<p className="px-1 text-sm text-muted-foreground">{m.globalDictationPromo()}</p>

			<SectionCard>
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">{m.globalHotkeyEnabled()}</span>
						<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={toggleHotkeyEnabled} />
					</div>
					{hotkey.hotkeyEnabled && (
						<div className="flex items-center justify-between gap-3">
							<span className="flex items-center gap-1 text-sm font-medium">
								<InfoTooltip text={m.dictationIndicatorSettingInfo()} />
								{m.dictationIndicatorSetting()}
							</span>
							<Switch checked={indicatorEnabled} onCheckedChange={changeIndicatorEnabled} />
						</div>
					)}
				</div>
			</SectionCard>

			{hotkey.hotkeyEnabled && (
				<>
					<SectionCard title={m.hotkeyActivationMode()}>
						<div className="space-y-3">
							<SegmentedControl
								value={hotkey.hotkeyActivationMode}
								onChange={(mode) => hotkey.setHotkeyActivationMode(mode as HotkeyActivationMode)}
								options={(['push-to-talk', 'toggle'] as HotkeyActivationMode[]).map((mode) => ({
									value: mode,
									label: activationLabels[mode](),
								}))}
							/>
							<p className="text-xs text-muted-foreground">{activationDescriptions[hotkey.hotkeyActivationMode]()}</p>
						</div>
					</SectionCard>

					<SectionCard title={m.globalHotkeyShortcut()}>
						<div className="space-y-3">
							<div className="flex items-center gap-1">
								{shortcutKeys.map((key, i) => (
									<kbd
										key={i}
										className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/80 bg-background/70 px-2 font-mono text-xs font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
										{key}
									</kbd>
								))}
							</div>
							<Input type="text" value={hotkey.hotkeyShortcut} onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)} />
						</div>
					</SectionCard>

					<SectionCard title={m.hotkeyOutputMode()}>
						<div className="space-y-4">
							<SegmentedControl
								value={hotkey.hotkeyOutputMode}
								onChange={(mode) => selectOutputMode(mode as HotkeyOutputMode)}
								options={(['clipboard', 'type'] as HotkeyOutputMode[]).map((mode) => ({
									value: mode,
									label: outputLabels[mode](),
								}))}
							/>
							{hotkey.hotkeyOutputMode === 'type' && !accessibilityGranted && (
								<div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-3">
									<div className="flex items-center justify-between gap-3">
										<span className="flex items-center gap-1 text-sm font-medium">
											<InfoTooltip text={m.accessibilityPermissionInfo()} />
											{m.accessibilityPermission()}
										</span>
										<Button
											size="sm"
											onClick={async () => {
												const granted = await requestAccessibility()
												setAccessibilityGranted(granted)
												if (!granted) setAccessibilityRequested(true)
											}}>
											{m.accessibilityGrant()}
										</Button>
									</div>
									{accessibilityRequested && <p className="text-xs italic text-muted-foreground">{m.accessibilityRestartHint()}</p>}
								</div>
							)}
							{hotkey.hotkeyOutputMode === 'type' && accessibilityGranted && (
								<div className="flex items-center gap-1.5 text-sm text-success">
									<Check className="h-4 w-4" />
									<span>{m.accessibilityPermission()}: {m.accessibilityGranted()}</span>
								</div>
							)}
							<div className="h-px bg-border/45" />
							<div className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-1 text-sm font-medium">
									<InfoTooltip text={m.normalizeHotkeyOutputInfo()} />
									{m.normalizeHotkeyOutput()}
								</span>
								<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
							</div>
						</div>
					</SectionCard>
				</>
			)}
		</div>
	)
}
