import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { Field, SectionCard } from './shared'
import { getDictationIndicatorEnabled, setDictationIndicatorEnabled } from '~/lib/dictation-indicator'

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
										<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
									</div>

									{hotkey.hotkeyEnabled && (
										<>
											<div className="flex items-center justify-between gap-3">
												<span className="flex items-center gap-1 text-sm font-medium">
													<InfoTooltip text={m.dictationIndicatorSettingInfo()} />
													{m.dictationIndicatorSetting()}
												</span>
												<Switch checked={indicatorEnabled} onCheckedChange={changeIndicatorEnabled} />
											</div>
											<div className="h-px bg-border/45" />
											<Field label={m.hotkeyActivationMode()}>
												<div className="flex gap-2">
													{(['push-to-talk', 'toggle'] as HotkeyActivationMode[]).map((mode) => (
														<button
															key={mode}
															type="button"
															onClick={() => hotkey.setHotkeyActivationMode(mode)}
															className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
																hotkey.hotkeyActivationMode === mode
																	? 'border-primary bg-primary/10 text-primary'
																	: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
															}`}>
										{activationLabels[mode]()}
														</button>
													))}
												</div>
											</Field>
											<Field
												label={
													<span className="flex items-center gap-2">
														{m.globalHotkeyShortcut()}
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
									{outputLabels[mode]()}
													</button>
												))}
											</div>
											<p className="text-xs italic text-muted-foreground">
								{activationDescriptions[hotkey.hotkeyActivationMode]()}
											</p>

											<div className="h-px bg-border/45" />

											<div className="flex items-center justify-between gap-3">
												<span className="flex items-center gap-1 text-sm font-medium">
													<InfoTooltip text={m.keepHotkeyRecordingInfo()} />
													{m.keepHotkeyRecording()}
												</span>
												<Switch checked={hotkey.hotkeySaveRecording} onCheckedChange={hotkey.setHotkeySaveRecording} />
											</div>

											<div className="h-px bg-border/45" />

											<div className="flex items-center justify-between gap-3">
												<span className="flex items-center gap-1 text-sm font-medium">
													<InfoTooltip text={m.normalizeHotkeyOutputInfo()} />
													{m.normalizeHotkeyOutput()}
												</span>
												<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />
											</div>
										</>
									)}
								</div>
							</SectionCard>
						</div>
	)
}
