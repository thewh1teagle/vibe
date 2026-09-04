import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import ShortcutRecorder from '~/components/shortcut-recorder'
import { Switch } from '~/components/ui/switch'
import { getDefaultHotkeyShortcut, useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'
import { AiTaskLink } from './ai'
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

export function DictationSection({ vm, onOpenCleanup }: { vm: SettingsViewModel; onOpenCleanup: () => void }) {
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

						<SettingsRow label={m.globalHotkeyShortcut()} description={m.globalHotkeyDescription()}>
							<ShortcutRecorder
								value={hotkey.hotkeyShortcut}
								onChange={hotkey.setHotkeyShortcut}
								defaultValue={getDefaultHotkeyShortcut()}
								onCapturingChange={hotkey.setHotkeyCapturing}
							/>
						</SettingsRow>

						<SettingsRow label={m.hotkeyOutputMode()}>
							<SegmentedControl value={hotkey.hotkeyOutputMode} options={outputOptions} onChange={hotkey.setHotkeyOutputMode} />
						</SettingsRow>

						<SettingsRow label={m.normalizeHotkeyOutput()} description={m.normalizeHotkeyOutputInfo()}>
							<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
						</SettingsRow>

						<AiTaskLink label={m.aiDictationTask()} enabled={vm.preference.ai.tasks.dictation.enabled} onClick={onOpenCleanup} />
					</>
				)}
			</SettingsGroup>
		</div>
	)
}
