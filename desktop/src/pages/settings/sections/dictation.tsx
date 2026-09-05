import { useEffect, useState, type ReactNode } from 'react'
import { Clipboard, TextCursorInput } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import ShortcutRecorder from '~/components/shortcut-recorder'
import { Switch } from '~/components/ui/switch'
import { getDefaultHotkeyShortcut, useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { SettingsGroup, SettingsNote, SettingsRow, type SettingsViewModel } from './shared'
import { AiTaskLink } from './ai'
import { getDictationIndicatorEnabled, setDictationIndicatorEnabled } from '~/lib/dictation-indicator'

function SegmentedControl<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T
	options: { value: T; label: string; icon?: ReactNode }[]
	onChange: (v: T) => void
}) {
	return (
		<div className="flex items-center gap-1 rounded-lg border border-border/65 bg-muted/40 p-0.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
						value === option.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
					}`}>
					{option.icon}
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
	const outputOptions: { value: HotkeyOutputMode; label: string; icon: ReactNode }[] = [
		{ value: 'clipboard', label: m.hotkeyOutputClipboard(), icon: <Clipboard aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> },
		{ value: 'type', label: m.hotkeyOutputType(), icon: <TextCursorInput aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> },
	]
	return (
		<div className="space-y-6">
			<SettingsGroup title={m.settingsDictationActivation()}>
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
						{hotkey.hotkeyShortcutError ? (
							<SettingsNote>
								<span role="alert" className="text-destructive">
									{m.shortcutRegistrationFailed({ error: hotkey.hotkeyShortcutError })}
								</span>
							</SettingsNote>
						) : hotkey.hotkeyShortcutRegistered ? (
							<SettingsNote>{m.shortcutRegistered()}</SettingsNote>
						) : null}
					</>
				)}
			</SettingsGroup>

			{hotkey.hotkeyEnabled && (
				<SettingsGroup title={m.settingsDictationOutput()}>
					<SettingsRow label={m.hotkeyOutputMode()}>
						<SegmentedControl value={hotkey.hotkeyOutputMode} options={outputOptions} onChange={hotkey.setHotkeyOutputMode} />
					</SettingsRow>

					<SettingsRow label={m.normalizeHotkeyOutput()} description={m.normalizeHotkeyOutputInfo()}>
						<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
					</SettingsRow>

					<AiTaskLink label={m.aiDictationTask()} enabled={vm.preference.ai.tasks.dictation.enabled} onClick={onOpenCleanup} />
				</SettingsGroup>
			)}
		</div>
	)
}
