import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, ChevronRight, Copy, ExternalLink } from 'lucide-react'
import { siClaude, siOllama } from 'simple-icons'
import { OPENAI_PATH } from '~/components/brand-glyph'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { defaultModel, type AiPlatform, type AiSettings } from '~/lib/ai'
import NumberField from '~/components/number-field'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, IconAction, SettingsGroup, SettingsNote, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

export type AiTaskId = keyof AiSettings['tasks']

const inlineLinkClass = 'h-6 w-6 rounded-md [&_svg]:size-3.5'

function LabelWithLink({ label, tooltip, onClick }: { label: string; tooltip: string; onClick: () => void }) {
	return (
		<span className="inline-flex items-center gap-1">
			{label}
			<IconAction label={tooltip} icon={<ExternalLink />} onClick={onClick} className={inlineLinkClass} />
		</span>
	)
}

/** Brand marks for the providers, so the picker reads at a glance. */
const platformIcons: Record<AiPlatform, { path: string; title: string }> = {
	claude: { path: siClaude.path, title: siClaude.title },
	ollama: { path: siOllama.path, title: siOllama.title },
	openai: { path: OPENAI_PATH, title: 'OpenAI' },
}

function PlatformOption({ platform }: { platform: AiPlatform }) {
	const icon = platformIcons[platform]
	return (
		<span className="flex items-center gap-2">
			<svg viewBox="0 0 24 24" role="img" aria-hidden className="h-4 w-4 shrink-0">
				<path d={icon.path} fill="currentColor" />
			</svg>
			<span className="capitalize">{platform === 'openai' ? 'OpenAI Compatible' : platform}</span>
		</span>
	)
}

/** The preset name for a task's row: "Meeting notes", or "Custom prompt" once edited. */
export function presetLabel(preset: string) {
	const labels: Record<string, () => string> = {
		summary: m.presetSummary,
		'meeting-notes': m.presetMeetingNotes,
		tldr: m.presetTldr,
		translate: m.presetTranslate,
		article: m.presetArticle,
		punctuation: m.presetPunctuation,
		formal: m.presetFormal,
		casual: m.presetCasual,
	}
	return labels[preset]?.() ?? m.presetCustom()
}

/**
 * AI in settings: the connection once, then one row per task. Each task has its own switch and
 * its own prompt page, so tuning summaries never changes what dictation does to a sentence.
 */
export function AiSection({ vm, onOpenPrompt }: { vm: SettingsViewModel; onOpenPrompt: (task: AiTaskId) => void }) {
	const { ai, setAi } = vm.preference
	const { connection, tasks } = ai
	const setConnection = (patch: Partial<AiSettings['connection']>) => setAi({ ...ai, connection: { ...connection, ...patch } })
	const setTask = <T extends AiTaskId>(task: T, patch: Partial<AiSettings['tasks'][T]>) =>
		setAi({ ...ai, tasks: { ...tasks, [task]: { ...tasks[task], ...patch } } })
	const test = vm.aiTest

	return (
		<div className="space-y-6">
			<SettingsGroup title={m.aiTasks()}>
				<SettingsRow label={m.aiSummaryTask()} description={presetLabel(tasks.summary.preset)}>
					<Button variant="outline" size="sm" className="rounded-lg" onClick={() => onOpenPrompt('summary')}>
						{m.aiEditPrompt()}
					</Button>
					<Switch checked={tasks.summary.enabled} onCheckedChange={(enabled) => setTask('summary', { enabled })} />
				</SettingsRow>
				{tasks.summary.enabled && (
					<SettingsRow label={m.autoSummarizeOnFinish()} description={m.autoSummarizeOnFinishInfo()}>
						<Switch checked={tasks.summary.autoOnFinish} onCheckedChange={(autoOnFinish) => setTask('summary', { autoOnFinish })} />
					</SettingsRow>
				)}
				<SettingsRow label={m.aiDictationTask()} description={presetLabel(tasks.dictation.preset)}>
					<Button variant="outline" size="sm" className="rounded-lg" onClick={() => onOpenPrompt('dictation')}>
						{m.aiEditPrompt()}
					</Button>
					<Switch checked={tasks.dictation.enabled} onCheckedChange={(enabled) => setTask('dictation', { enabled })} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.connection()}>
				<SettingsRow label={m.llmPlatform()}>
					<Select value={connection.platform} onValueChange={(platform: AiPlatform) => setConnection({ platform, model: defaultModel(platform) })}>
						<SelectTrigger className={`w-52 ${rowControlClass}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(['claude', 'ollama', 'openai'] as const).map((name) => (
								<SelectItem key={name} value={name}>
									<PlatformOption platform={name} />
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingsRow>

				{connection.platform === 'claude' && (
					<>
						<SettingsRow
							label={<LabelWithLink label={m.llmApiKey()} tooltip={m.findHere()} onClick={() => openUrl(config.llmApiKeyUrl)} />}
							description={m.infoLlmApiKey()}>
							<Input
								value={connection.claudeApiKey}
								onChange={(e) => setConnection({ claudeApiKey: e.target.value })}
								placeholder={m.pasteApiKey()}
								type="password"
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
								value={connection.model}
								onChange={(e) => setConnection({ model: e.target.value })}
								placeholder={defaultModel('claude')}
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				{connection.platform === 'ollama' && (
					<>
						<SettingsRow label={m.ollamaBaseUrl()}>
							<Input
								value={connection.ollamaBaseUrl}
								onChange={(e) => setConnection({ ollamaBaseUrl: e.target.value })}
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow
							label={
								<LabelWithLink
									label={m.llmModel()}
									tooltip={m.findHere()}
									onClick={() => openUrl(`https://ollama.com/library/${connection.model}`)}
								/>
							}>
							<Input
								value={connection.model}
								onChange={(e) => setConnection({ model: e.target.value })}
								placeholder={defaultModel('ollama')}
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				{connection.platform === 'openai' && (
					<>
						<SettingsRow label={m.baseUrl()}>
							<Input
								value={connection.openaiBaseUrl}
								onChange={(e) => setConnection({ openaiBaseUrl: e.target.value })}
								placeholder="https://api.openai.com/v1"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow label={m.apiKey()}>
							<Input
								value={connection.openaiApiKey}
								onChange={(e) => setConnection({ openaiApiKey: e.target.value })}
								placeholder={m.optionalLocalServerKey()}
								type="password"
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
						<SettingsRow label={m.llmModel()}>
							<Input
								value={connection.model}
								onChange={(e) => setConnection({ model: e.target.value })}
								placeholder={defaultModel('openai')}
								className={`w-64 ${rowControlClass}`}
							/>
						</SettingsRow>
					</>
				)}

				<SettingsRow label={m.contextSize()} description={m.infoContextSize()}>
					<NumberField
						aria-label={m.contextSize()}
						value={connection.contextTokens}
						min={4096}
						max={1_048_576}
						step={4096}
						onChange={(contextTokens) => setConnection({ contextTokens })}
					/>
				</SettingsRow>
				<SettingsNote>
					<span className="italic">{m.contextSizeRuleOfThumb()}</span>
				</SettingsNote>

				<SettingsRow
					label={m.aiTestConnection()}
					description={
						test?.status === 'ok' ? (
							<span className="text-success">{m.aiTestOk({ ms: String(test.ms) })}</span>
						) : test?.status === 'error' ? (
							<span className="text-destructive">{m.checkError()}</span>
						) : (
							m.aiTestInfo()
						)
					}>
					<Button variant="outline" size="sm" className="rounded-lg" onClick={() => void vm.testAi()} disabled={test?.status === 'testing'}>
						{test?.status === 'testing' ? <Spinner className="h-3.5 w-3.5" /> : null}
						{m.runLlmCheck()}
					</Button>
				</SettingsRow>
				{test?.status === 'error' && (
					<div className="relative px-4 py-3">
						<button
							type="button"
							className="absolute end-5 top-4 cursor-pointer p-1 text-muted-foreground hover:text-foreground"
							onClick={vm.copyAiError}
							aria-label={m.copy()}>
							{vm.aiErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
						</button>
						<pre className="max-h-40 overflow-y-auto pe-8 text-xs break-all whitespace-pre-wrap text-destructive">{test.error}</pre>
					</div>
				)}
			</SettingsGroup>

			{connection.platform === 'claude' && (
				<SettingsGroup title={m.settingsUsageAndBilling()}>
					<ActionRow label={m.setMonthlySpendLimit()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.llmLimitsUrl)} />
					<ActionRow label={m.llmCurrentCost()} icon={<LinkIcon className="h-4 w-4" />} onClick={() => openUrl(config.llmCostUrl)} />
				</SettingsGroup>
			)}
		</div>
	)
}

/** A row for another section that points into the AI page: state on the right, arrow to go. */
export function AiTaskLink({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
	return (
		<ActionRow
			label={label}
			description={enabled ? m.on() : m.off()}
			icon={<ChevronRight className="h-4 w-4 rtl:rotate-180" />}
			onClick={onClick}
			activateOnClick
		/>
	)
}
