import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Field, type SettingsViewModel } from './shared'

export function SummarizeSection({ vm }: { vm: SettingsViewModel }) {
	const { t, i18n } = useTranslation()
	return (
<div className="space-y-5">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<h3 className="text-sm font-semibold">{t('common.process-with-llm')} ✨</h3>
										<InfoTooltip text={t('common.info-llm-summarize')} />
									</div>
									<Switch checked={vm.preference.llmConfig?.enabled} onCheckedChange={vm.onEnableLlm} />
									</div>

									<Field label={t('common.llm-platform')}>
										<Select
											value={vm.preference.llmConfig?.platform}
											onValueChange={(value) => {
												const lang = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language) ?? 'English'
												const defaults =
													value === 'ollama' ? defaultOllamaConfig(lang) : value === 'openai' ? defaultOpenAIConfig(lang) : defaultClaudeConfig(lang)
												vm.preference.setLlmConfig({
													...defaults,
													ollamaBaseUrl: vm.preference.llmConfig.ollamaBaseUrl,
													claudeApiKey: vm.preference.llmConfig.claudeApiKey,
													openaiBaseUrl: vm.preference.llmConfig.openaiBaseUrl,
													openaiApiKey: vm.preference.llmConfig.openaiApiKey,
													enabled: vm.preference.llmConfig?.enabled ?? false,
												})
											}}>
											<SelectTrigger className="capitalize">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{['claude', 'ollama', 'openai'].map((name) => (
													<SelectItem key={name} value={name} className="capitalize">
														{name === 'openai' ? 'OpenAI Compatible' : name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>

									{vm.preference.llmConfig?.platform === 'claude' && (
										<>
											<Field
												label={
													<>
														<InfoTooltip text={t('common.info-llm-api-key')} />
														{t('common.llm-api-key')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl(config.llmApiKeyUrl)}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.claudeApiKey}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, claudeApiKey: e.target.value })}
													placeholder="Paste here your API key"
													type="text"
												/>
											</Field>
											<Field
												label={
													<>
														{t('common.llm-model')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl('https://docs.anthropic.com/en/docs/about-claude/models')}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
													placeholder="claude-sonnet-4-5"
												/>
											</Field>
										</>
									)}

									{vm.preference.llmConfig?.platform === 'ollama' && (
										<>
											<Field label={t('common.ollama-base-url')}>
												<Input
													value={vm.preference.llmConfig?.ollamaBaseUrl}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, ollamaBaseUrl: e.target.value })}
												/>
											</Field>
											<Field
												label={
													<>
														{t('common.llm-model')}
														<button
															type="button"
															className="ml-1 text-primary underline hover:text-primary/80"
															onClick={() => openUrl(`https://ollama.com/library/${vm.preference.llmConfig.model}`)}>
															{t('common.find-here')}
														</button>
													</>
												}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
												/>
											</Field>
										</>
									)}

									{vm.preference.llmConfig?.platform === 'openai' && (
										<>
											<Field label="Base URL">
												<Input
													value={vm.preference.llmConfig?.openaiBaseUrl}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiBaseUrl: e.target.value })}
													placeholder="https://api.openai.com/v1"
												/>
											</Field>
											<Field label="API Key">
												<Input
													value={vm.preference.llmConfig?.openaiApiKey}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiApiKey: e.target.value })}
													placeholder="sk-... (optional for local servers)"
													type="text"
												/>
											</Field>
											<Field label={t('common.llm-model')}>
												<Input
													value={vm.preference.llmConfig?.model}
													onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
													placeholder="gpt-4o-mini"
												/>
											</Field>
										</>
									)}

									<Field
										label={
											<>
												<InfoTooltip text={t('common.info-llm-prompt')} />
												{t('common.llm-prompt')}
											</>
										}>
										<Textarea
											value={vm.preference.llmConfig?.prompt}
											onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, prompt: e.target.value })}
											onBlur={vm.validateLlmPrompt}
											className="min-h-[100px]"
										/>
									</Field>

									<Field
										label={
											<>
												<InfoTooltip text={t('common.info-max-tokens')} />
												{t('common.max-tokens')}
											</>
										}>
										<Input
											type="number"
											onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, maxTokens: vm.parseIntOr(e.target.value, 1) })}
											value={vm.preference.llmConfig?.maxTokens}
										/>
									</Field>

									<Button onClick={vm.checkLlm} size="sm" className="w-full">
										{t('common.run-llm-check')}
									</Button>

									{vm.llmError && (
										<div className="relative rounded-lg border border-destructive/30 bg-destructive/5 p-3 pe-10">
											<button type="button" className="absolute end-2 top-2 p-1 text-muted-foreground hover:text-foreground" onClick={vm.copyLlmError}>
												{vm.llmErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
											</button>
											<pre className="whitespace-pre-wrap break-all text-xs text-destructive">{vm.llmError}</pre>
										</div>
									)}

									{vm.preference.llmConfig?.platform === 'claude' && (
										<div className="flex flex-col gap-2 text-sm">
											<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => openUrl(config.llmLimitsUrl)}>
												{t('common.set-monthly-spend-limit')}
											</button>
											<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => openUrl(config.llmCostUrl)}>
												{t('common.llm-current-cost')}
											</button>
										</div>
									)}
								</div>
							</div>
	)
}
