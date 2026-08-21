import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, IconAction, SettingsField, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

const inlineLinkClass = 'h-6 w-6 rounded-md [&_svg]:size-3.5'

function LabelWithLink({ label, tooltip, onClick }: { label: string; tooltip: string; onClick: () => void }) {
	return (
		<span className="inline-flex items-center gap-1">
			{label}
			<IconAction label={tooltip} icon={<ExternalLink />} onClick={onClick} className={inlineLinkClass} />
		</span>
	)
}

export function SummarizeSection({ vm }: { vm: SettingsViewModel }) {
	const platform = vm.preference.llmConfig?.platform

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow label={m.processWithLlm()} description={m.infoLlmSummarize()}>
					<Switch checked={vm.preference.llmConfig?.enabled} onCheckedChange={vm.onEnableLlm} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label={m.llmPlatform()}>
					<Select
						value={platform}
						onValueChange={(value) => {
							const lang = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
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
						<SelectTrigger className={`w-52 capitalize ${rowControlClass}`}>
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
				</SettingsRow>

				{platform === 'claude' && (
					<>
						<SettingsRow
							label={<LabelWithLink label={m.llmApiKey()} tooltip={m.findHere()} onClick={() => openUrl(config.llmApiKeyUrl)} />}
							description={m.infoLlmApiKey()}>
							<Input
								value={vm.preference.llmConfig?.claudeApiKey}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, claudeApiKey: e.target.value })}
								placeholder={m.pasteApiKey()}
								type="text"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow
							label={
								<LabelWithLink
									label={m.llmModel()}
									tooltip={m.findHere()}
									onClick={() => openUrl('https://docs.anthropic.com/en/docs/about-claude/models')}
								/>
							}>
							<Input
								value={vm.preference.llmConfig?.model}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
								placeholder="claude-sonnet-4-5"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				{platform === 'ollama' && (
					<>
						<SettingsRow label={m.ollamaBaseUrl()}>
							<Input
								value={vm.preference.llmConfig?.ollamaBaseUrl}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, ollamaBaseUrl: e.target.value })}
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow
							label={
								<LabelWithLink
									label={m.llmModel()}
									tooltip={m.findHere()}
									onClick={() => openUrl(`https://ollama.com/library/${vm.preference.llmConfig.model}`)}
								/>
							}>
							<Input
								value={vm.preference.llmConfig?.model}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
								placeholder="llama3.2"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				{platform === 'openai' && (
					<>
						<SettingsRow label={m.baseUrl()}>
							<Input
								value={vm.preference.llmConfig?.openaiBaseUrl}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiBaseUrl: e.target.value })}
								placeholder="https://api.openai.com/v1"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow label={m.apiKey()}>
							<Input
								value={vm.preference.llmConfig?.openaiApiKey}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, openaiApiKey: e.target.value })}
								placeholder={m.optionalLocalServerKey()}
								type="text"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow label={m.llmModel()}>
							<Input
								value={vm.preference.llmConfig?.model}
								onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, model: e.target.value })}
								placeholder="gpt-4o-mini"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				<SettingsRow label={m.maxTokens()} description={m.infoMaxTokens()}>
					<Input
						type="number"
						onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, maxTokens: vm.parseIntOr(e.target.value, 1) })}
						value={vm.preference.llmConfig?.maxTokens}
						className={`w-24 text-end ${rowControlClass}`}
					/>
				</SettingsRow>

				<SettingsField label={m.llmPrompt()} description={m.infoLlmPrompt()}>
					<Textarea
						value={vm.preference.llmConfig?.prompt}
						onChange={(e) => vm.preference.setLlmConfig({ ...vm.preference.llmConfig, prompt: e.target.value })}
						onBlur={vm.validateLlmPrompt}
						placeholder="Summarize the following transcript in clear bullet points:%s"
						className="min-h-24 max-h-60 w-full resize-none overflow-y-auto rounded-lg bg-muted/40 text-sm"
					/>
				</SettingsField>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label="Connection" description={vm.llmError ? m.checkError() : undefined}>
					<Button variant="outline" size="sm" onClick={vm.checkLlm}>
						{m.runLlmCheck()}
					</Button>
				</SettingsRow>
				{vm.llmError && (
					<div className="relative px-4 py-3">
						<button
							type="button"
							className="absolute end-5 top-4 p-1 text-muted-foreground hover:text-foreground"
							onClick={vm.copyLlmError}
							aria-label={m.copy()}>
							{vm.llmErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
						</button>
						<pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all pe-8 text-xs text-destructive">{vm.llmError}</pre>
					</div>
				)}
			</SettingsGroup>

			{platform === 'claude' && (
				<SettingsGroup>
					<ActionRow label={m.setMonthlySpendLimit()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.llmLimitsUrl)} />
					<ActionRow label={m.llmCurrentCost()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.llmCostUrl)} />
				</SettingsGroup>
			)}
		</div>
	)
}
