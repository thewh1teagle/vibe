import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '~/components/info-tooltip'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { useHotkeyProvider, type HotkeyOutputMode } from '~/providers/hotkey'
import { Field, SectionCard } from './shared'

export function DictationSection() {
	const { t } = useTranslation()
	const hotkey = useHotkeyProvider()
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = { CmdOrCtrl: isMac ? '⌘' : 'Ctrl', Cmd: '⌘', Ctrl: isMac ? '⌃' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Option: '⌥' }
		return hotkey.hotkeyShortcut.split('+').map((key) => keyMap[key] ?? key)
	}, [hotkey.hotkeyShortcut, isMac])
	return (
<div className="space-y-5">
							<p className="px-1 text-sm text-muted-foreground">{t('common.global-dictation-promo')}</p>
							<SectionCard>
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{t('common.global-hotkey-enabled')}</span>
										<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />
									</div>

									{hotkey.hotkeyEnabled && (
										<>
											<Field
												label={
													<span className="flex items-center gap-2">
														{t('common.global-hotkey-shortcut')}
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
														{t(`common.hotkey-output-${mode}`)}
													</button>
												))}
											</div>
											<p className="text-xs italic text-muted-foreground">{t('common.global-hotkey-description')}</p>

											<div className="h-px bg-border/45" />

											<div className="flex items-center justify-between gap-3">
												<span className="flex items-center gap-1 text-sm font-medium">
													<InfoTooltip text={t('common.normalize-hotkey-output-info')} />
													{t('common.normalize-hotkey-output')}
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
