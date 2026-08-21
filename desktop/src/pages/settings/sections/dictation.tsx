import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { SettingsGroup, SettingsRow, rowControlClass } from './shared'
import { getDictationIndicatorEnabled, setDictationIndicatorEnabled } from '~/lib/dictation-indicator'

function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
	return (
		<div className="flex items-center gap-1 rounded-lg border border-border/65 bg-muted/40 p-0.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors ${
						value === option.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
					}`}>
					{option.label}
				</button>
			))}
		</div>
	)
}

export function DictationSection() {
	const hotkey = useHotkeyProvider()
	const [indicatorEnabled, setIndicatorEnabled] = useState(true)
	useEffect(() => {
		getDictationIndicatorEnabled().then(setIndicatorEnabled).catch(console.error)
	}, [])
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
	const activationDescriptions = {
		'push-to-talk': m.hotkeyActivationPushToTalkDescription,
		toggle: m.hotkeyActivationToggleDescription,
	} as const
	const activationOptions: { value: HotkeyActivationMode; label: string }[] = [
		{ value: 'push-to-talk', label: m.hotkeyActivationPushToTalk() },
		{ value: 'toggle', label: m.hotkeyActivationToggle() },
	]
	const outputOptions: { value: HotkeyOutputMode; label: string }[] = [
		{ value: 'clipboard', label: m.hotkeyOutputClipboard() },
		{ value: 'type', label: m.hotkeyOutputType() },
	]
	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = {
			CmdOrCtrl: isMac ? '⌘' : 'Ctrl',
			Cmd: '⌘',
			Ctrl: isMac ? '⌃' : 'Ctrl',
			Shift: isMac ? '⇧' : 'Shift',
			Alt: isMac ? '⌥' : 'Alt',
			Option: '⌥',
		}
		return hotkey.hotkeyShortcut.split('+').map((key) => keyMap[key] ?? key)
	}, [hotkey.hotkeyShortcut, isMac])

	return (
		<div className="space-y-6">
			<SettingsGroup description={m.globalDictationPromo()}>
				<SettingsRow label={m.globalHotkeyEnabled()}>
					<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
				</SettingsRow>

				{hotkey.hotkeyEnabled && (
					<>
						<SettingsRow label={m.dictationIndicatorSetting()} description={m.dictationIndicatorSettingInfo()}>
							<Switch checked={indicatorEnabled} onCheckedChange={changeIndicatorEnabled} />
						</SettingsRow>

						<SettingsRow label={m.hotkeyActivationMode()} description={activationDescriptions[hotkey.hotkeyActivationMode]()}>
							<SegmentedControl value={hotkey.hotkeyActivationMode} options={activationOptions} onChange={hotkey.setHotkeyActivationMode} />
						</SettingsRow>

						<SettingsRow
							label={m.globalHotkeyShortcut()}
							description={
								<span className="flex items-center gap-1">
									{shortcutKeys.map((key, i) => (
										<kbd
											key={i}
											className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border/80 bg-muted/50 px-1 font-mono text-[10px] font-medium text-foreground/80">
											{key}
										</kbd>
									))}
								</span>
							}>
							<Input
								type="text"
								value={hotkey.hotkeyShortcut}
								onChange={(e) => hotkey.setHotkeyShortcut(e.target.value)}
								className={`w-48 ${rowControlClass}`}
							/>
						</SettingsRow>

						<SettingsRow label={m.hotkeyOutputMode()}>
							<SegmentedControl value={hotkey.hotkeyOutputMode} options={outputOptions} onChange={hotkey.setHotkeyOutputMode} />
						</SettingsRow>

						<SettingsRow label={m.normalizeHotkeyOutput()} description={m.normalizeHotkeyOutputInfo()}>
							<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
						</SettingsRow>
					</>
				)}
			</SettingsGroup>
		</div>
	)
}
