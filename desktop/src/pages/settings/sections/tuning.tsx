import { message } from '@tauri-apps/plugin-dialog'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Field, SectionCard, type SettingsViewModel } from './shared'

export function TuningSection({ vm }: { vm: SettingsViewModel }) {
	return (
<div className="space-y-5">
							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{m.speakerTiming()}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={m.infoDiarization()} />
												{m.enableDiarization()}
											</span>
											<Switch checked={vm.preference.diarizeEnabled} onCheckedChange={vm.toggleDiarization} />
										</div>
										{vm.preference.diarizeEnabled && (
											<p className="text-sm italic text-muted-foreground">{m.diarizeMaxSpeakersNote()}</p>
										)}
										<div className="h-px bg-border/45" />
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
														<InfoTooltip text={m.stableTimestampsInfo()} />
														{m.enableStableTimestamps()}
											</span>
											<Switch checked={vm.preference.stableTimestampsEnabled} onCheckedChange={vm.handleStableTimestampsToggle} />
										</div>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{m.modelOptions()}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={m.infoTranslateToEnglish()} />
												{m.translateToEnglish()}
											</span>
											<Switch
												checked={Boolean(vm.preference.modelOptions.translate)}
												onCheckedChange={(checked) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, translate: checked })}
											/>
										</div>

										<Field
											label={
												<>
													<InfoTooltip text={m.infoPrompt()} />
													{m.prompt()} ({m.leftover()} {1024 - (vm.preference.modelOptions?.init_prompt?.length ?? 0)}{' '}
													{m.characters()})
												</>
											}>
											<Textarea
												value={vm.preference.modelOptions?.init_prompt}
												onChange={(e) =>
													vm.preference.setModelOptions({ ...vm.preference.modelOptions, init_prompt: e.target.value.slice(0, 1024) })
												}
												className="min-h-[80px]"
											/>
										</Field>

										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={m.infoUseWordTimestamps()} />
												{m.useWordTimestamps()}
											</span>
											<Switch
												checked={Boolean(vm.preference.modelOptions.word_timestamps)}
												onCheckedChange={(checked) => vm.preference.setModelOptions({ ...vm.preference.modelOptions, word_timestamps: checked })}
											/>
										</div>

										<div className="grid grid-cols-2 gap-4">
											<Field
												label={
													<>
														<InfoTooltip text={m.infoMaxSentenceLen()} />
														{m.maxSentenceLen()}
													</>
												}>
												<Input
													type="number"
													value={vm.preference.modelOptions.max_sentence_len}
													onChange={(e) => {
														if (!vm.preference.modelOptions.word_timestamps) message(m.pleaseEnableWordTimestamps())
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_sentence_len: vm.parseIntOr(e.target.value, 1) })
													}}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={m.infoThreads()} />
														{m.threads()}
													</>
												}>
												<Input
													type="number"
													value={vm.preference.modelOptions.n_threads}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, n_threads: vm.parseIntOr(e.target.value, 1) })
													}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={m.infoTemperature()} />
														{m.temperature()}
													</>
												}>
												<Input
													type="number"
													step={0.1}
													value={vm.preference.modelOptions.temperature}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, temperature: parseFloat(e.target.value) || 0 })
													}
												/>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip text={m.infoMaxTextCtx()} />
														{m.maxTextCtx()}
													</>
												}>
												<Input
													type="number"
													step={1}
													value={vm.preference.modelOptions.max_text_ctx ?? 0}
													onChange={(e) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, max_text_ctx: vm.parseIntOr(e.target.value, 0) })
													}
												/>
											</Field>
										</div>

										<div className="grid grid-cols-2 gap-4">
											<Field
												label={
													<>
																<InfoTooltip text={m.samplingStrategyInfo()} />
																		{m.samplingStrategy()}
													</>
												}>
												<Select
													value={vm.preference.modelOptions.sampling_strategy}
													onValueChange={(value) =>
														vm.preference.setModelOptions({ ...vm.preference.modelOptions, sampling_strategy: value as 'greedy' | 'beam search' })
													}>
													<SelectTrigger className="capitalize">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{['beam search', 'greedy'].map((name) => (
															<SelectItem key={name} value={name} className="capitalize">
																{name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</Field>

											<Field
												label={
													<>
														<InfoTooltip
															text={
																vm.preference.modelOptions.sampling_strategy === 'greedy'
																			? m.greedyInfo()
																			: m.beamInfo()
															}
														/>
																	{vm.preference.modelOptions.sampling_strategy === 'greedy' ? m.bestOf() : m.beamSize()}
													</>
												}>
												<Input
													type="number"
													step={1}
													value={
														vm.preference.modelOptions.sampling_strategy === 'greedy'
															? (vm.preference.modelOptions.best_of ?? 5)
															: (vm.preference.modelOptions.beam_size ?? 5)
													}
													onChange={(e) => {
														const val = vm.parseIntOr(e.target.value, 5)
														if (vm.preference.modelOptions.sampling_strategy === 'greedy') {
															vm.preference.setModelOptions({ ...vm.preference.modelOptions, best_of: val })
														} else {
															vm.preference.setModelOptions({ ...vm.preference.modelOptions, beam_size: val })
														}
													}}
												/>
											</Field>
										</div>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{m.ffmpegOptions()}</span>
								<SectionCard>
									<div className="space-y-4">
										<div className="flex items-center justify-between">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={m.infoNormalizeLoudness()} />
												{m.normalizeLoudness()}
											</span>
											<Switch
												checked={vm.preference.ffmpegOptions.normalize_loudness}
												onCheckedChange={(checked) =>
													vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, normalize_loudness: checked })
												}
											/>
										</div>

										<Field
											label={
												<>
													<InfoTooltip text={'ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error'} />
													{m.customFfmpegCommand()}
												</>
											}>
											<Input
												value={vm.preference.ffmpegOptions.custom_command ?? ''}
												onChange={(e) =>
													vm.preference.setFfmpegOptions({ ...vm.preference.ffmpegOptions, custom_command: e.target.value || null })
												}
												placeholder={vm.preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : ''}
												type="text"
											/>
										</Field>
									</div>
								</SectionCard>
							</div>

							<div className="space-y-2">
								<span className="px-1 text-sm font-semibold text-foreground/95">{m.presets()}</span>
								<SectionCard>
									<div className="flex gap-4">
										<Button variant="secondary" onClick={vm.preference.enableSubtitlesPreset} className="flex-1">
											{m.presetForSubtitles()}
										</Button>
										<Button variant="secondary" onClick={vm.preference.resetOptions} className="flex-1">
											{m.resetOptions()}
										</Button>
									</div>
								</SectionCard>
							</div>
						</div>
	)
}
