import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { PLACEHOLDERS, createClient, fillPrompt, presets, type AiSettings } from '~/lib/ai'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/style'
import { SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'
import { presetLabel, type AiTaskId } from './ai'

/** The prompt must have somewhere to put the text. `%s` is the pre-3.2 spelling and still works. */
export function promptHasBody(prompt: string, task: AiTaskId) {
	const body = task === 'summary' ? PLACEHOLDERS.transcript : PLACEHOLDERS.text
	return prompt.includes(body) || prompt.includes('%s')
}

/** Chips that describe what each placeholder becomes; clicking one inserts it at the caret. */
function placeholdersFor(task: AiTaskId): Array<{ token: string; hint: string }> {
	return task === 'summary'
		? [
				{ token: PLACEHOLDERS.transcript, hint: m.placeholderTranscript() },
				{ token: PLACEHOLDERS.language, hint: m.placeholderLanguage() },
				{ token: PLACEHOLDERS.speakers, hint: m.placeholderSpeakers() },
			]
		: [
				{ token: PLACEHOLDERS.text, hint: m.placeholderText() },
				{ token: PLACEHOLDERS.language, hint: m.placeholderLanguage() },
			]
}

/**
 * One task's page: its switch, a preset picker, the prompt itself with its placeholders
 * explained, and for dictation a sentence to try it on before trusting it with real words.
 */
export function AiPromptSection({ vm, task }: { vm: SettingsViewModel; task: AiTaskId }) {
	const { ai, setAi } = vm.preference
	const settings = ai.tasks[task]
	const update = (patch: Partial<AiSettings['tasks'][AiTaskId]>) => setAi({ ...ai, tasks: { ...ai.tasks, [task]: { ...settings, ...patch } } })
	const taskPresets = presets.filter((preset) => preset.task === task)
	const valid = promptHasBody(settings.prompt, task)
	const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null)
	const [sample, setSample] = useState<string>(() => m.aiTrySample())
	const [trial, setTrial] = useState<{ status: 'running' } | { status: 'done'; text: string } | { status: 'error'; error: string } | null>(null)

	function insert(token: string) {
		if (!textarea) return update({ prompt: settings.prompt + token, preset: 'custom' })
		const start = textarea.selectionStart ?? settings.prompt.length
		const end = textarea.selectionEnd ?? start
		const prompt = settings.prompt.slice(0, start) + token + settings.prompt.slice(end)
		update({ prompt, preset: 'custom' })
		requestAnimationFrame(() => {
			textarea.focus()
			textarea.setSelectionRange(start + token.length, start + token.length)
		})
	}

	async function tryIt() {
		setTrial({ status: 'running' })
		try {
			const text = await createClient(ai.connection).ask(fillPrompt(settings.prompt, { text: sample, transcript: sample, language: 'English' }))
			setTrial({ status: 'done', text: text.trim() })
		} catch (error) {
			setTrial({ status: 'error', error: String(error instanceof Error ? error.message : error) })
		}
	}

	return (
		<div className="space-y-6">
			<SettingsGroup description={task === 'summary' ? m.aiSummaryTaskInfo() : m.aiDictationTaskInfo()}>
				<SettingsRow label={task === 'summary' ? m.aiSummaryTask() : m.aiDictationTask()}>
					<Switch checked={settings.enabled} onCheckedChange={(enabled) => update({ enabled })} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.aiPresets()}>
				<div className="flex flex-wrap gap-1.5 px-4 py-3">
					{taskPresets.map((preset) => {
						const selected = settings.preset === preset.id
						return (
							<button
								key={preset.id}
								type="button"
								aria-pressed={selected}
								onClick={() => update({ preset: preset.id, prompt: preset.prompt })}
								className={cn(
									'cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors',
									selected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-muted text-muted-foreground hover:text-foreground',
								)}>
								{presetLabel(preset.id)}
							</button>
						)
					})}
					{settings.preset === 'custom' && (
						<span className="rounded-full border border-primary bg-primary px-3 py-1 text-[12px] text-primary-foreground">{m.presetCustom()}</span>
					)}
				</div>
			</SettingsGroup>

			<SettingsGroup title={m.llmPrompt()}>
				<div className="space-y-2 px-4 py-3">
					<Textarea
						ref={setTextarea}
						value={settings.prompt}
						onChange={(e) => update({ prompt: e.target.value, preset: 'custom' })}
						spellCheck={false}
						className="max-h-[480px] min-h-[220px] w-full resize-y overflow-y-auto rounded-lg bg-muted/40 font-mono text-[12px] leading-relaxed"
					/>
					{!valid && (
						<p className="text-xs text-destructive">
							{m.promptMustContainPlaceholder({ placeholder: task === 'summary' ? PLACEHOLDERS.transcript : PLACEHOLDERS.text })}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
						{placeholdersFor(task).map((item) => (
							<button key={item.token} type="button" onClick={() => insert(item.token)} className="cursor-pointer hover:text-foreground">
								<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{item.token}</code> {item.hint}
							</button>
						))}
					</div>
				</div>
			</SettingsGroup>

			{task === 'dictation' && (
				<SettingsGroup title={m.aiTryIt()}>
					<div className="space-y-2 px-4 py-3">
						<Textarea
							value={sample}
							onChange={(e) => setSample(e.target.value)}
							className="min-h-[60px] w-full resize-y rounded-lg bg-muted/40 text-sm"
						/>
						<div className="flex items-center gap-3">
							<Button
								variant="outline"
								size="sm"
								className="rounded-lg"
								onClick={() => void tryIt()}
								disabled={trial?.status === 'running' || !valid || !sample.trim()}>
								{trial?.status === 'running' && <Spinner className="h-3.5 w-3.5" />}
								{m.aiTryIt()}
							</Button>
						</div>
						{trial?.status === 'done' && (
							<p className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm whitespace-pre-wrap">{trial.text || m.aiTryEmpty()}</p>
						)}
						{trial?.status === 'error' && <pre className="text-xs break-all whitespace-pre-wrap text-destructive">{trial.error}</pre>}
					</div>
				</SettingsGroup>
			)}
		</div>
	)
}
