import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { siClaude, siOllama } from 'simple-icons'
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

/** OpenAI has no simple-icons entry (trademark policy), so its mark ships with us. */
const OPENAI_PATH =
	'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4066-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.0379-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

/** Brand marks for the LLM providers, so the picker reads at a glance. */
const platformIcons: Record<string, { path: string; title: string }> = {
	claude: { path: siClaude.path, title: siClaude.title },
	ollama: { path: siOllama.path, title: siOllama.title },
	openai: { path: OPENAI_PATH, title: 'OpenAI' },
}

function PlatformOption({ platform }: { platform: string }) {
	const icon = platformIcons[platform]
	return (
		<span className="flex items-center gap-2">
			{icon && (
				<svg viewBox="0 0 24 24" role="img" aria-hidden className="h-4 w-4 shrink-0">
					<path d={icon.path} fill="currentColor" />
				</svg>
			)}
			<span className="capitalize">{platform === 'openai' ? 'OpenAI Compatible' : platform}</span>
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
						<SelectTrigger className={`w-52 ${rowControlClass}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{['claude', 'ollama', 'openai'].map((name) => (
								<SelectItem key={name} value={name}>
									<PlatformOption platform={name} />
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
						placeholder={m.llmPromptPlaceholder()}
						className="min-h-24 max-h-60 w-full resize-none overflow-y-auto rounded-lg bg-muted/40 text-sm"
					/>
				</SettingsField>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label={m.connection()} description={vm.llmError ? m.checkError() : undefined}>
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
