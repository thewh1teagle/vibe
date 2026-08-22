import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { Claude, Ollama, OpenAICompatible, type Llm } from '~/lib/llm'
import { asText } from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job, TranscribeQueue } from './use-transcribe-queue'

export interface Summaries {
	/** The AI step is configured and switched on in settings. */
	enabled: boolean
	/** Job ids currently waiting on the model. */
	pending: Record<string, boolean>
	summarize: (job: Job, prompt?: string) => Promise<void>
	/** Job whose summary arrived on its own, so the view can switch to it once. */
	autoSummarized: string | null
	clearAutoSummarized: () => void
}

/**
 * Runs the configured LLM over a finished transcript. A transcription made in this session is
 * summarized as soon as it finishes (that is what the settings switch promises); transcripts opened
 * from the store are summarized on demand from the toolbar.
 */
export function useSummaries(queue: TranscribeQueue): Summaries {
	const preference = usePreferenceProvider()
	const [pending, setPending] = useState<Record<string, boolean>>({})
	const [autoSummarized, setAutoSummarized] = useState<string | null>(null)
	// Jobs already handed to the model once, so a failure does not retry forever.
	const attempted = useRef<Set<string>>(new Set())

	const config = preference.llmConfig
	const enabled = Boolean(config?.enabled && config.prompt?.includes('%s'))

	const llm = useMemo<Llm | null>(() => {
		if (!config) return null
		if (config.platform === 'ollama') return new Ollama(config)
		if (config.platform === 'openai') return new OpenAICompatible(config)
		return new Claude(config)
	}, [config])

	const summarize = useCallback(
		async (job: Job, prompt?: string) => {
			const template = prompt ?? config?.prompt
			if (!llm || !template || !job.segments.length) return
			setPending((previous) => ({ ...previous, [job.id]: true }))
			try {
				const question = template.replace('%s', asText(job.segments, m.speakerPrefix()))
				const answer = llm.ask(question)
				toast.promise(answer, {
					loading: m.summarizeLoading(),
					error: (error) => String(error),
					success: m.summarizeSuccess(),
					position: 'bottom-center',
				})
				const text = (await answer)?.trim()
				if (text) queue.setJobSummary(job.id, text)
				return
			} catch (error) {
				console.error('summarize failed:', error)
			} finally {
				setPending((previous) => {
					const next = { ...previous }
					delete next[job.id]
					return next
				})
			}
		},
		[config?.prompt, llm, queue],
	)

	// Auto-run for transcriptions produced in this session.
	useEffect(() => {
		if (!enabled) return
		for (const job of queue.jobs) {
			if (job.status !== 'done' || job.hydrated || job.summary || !job.segments.length) continue
			if (attempted.current.has(job.id) || pending[job.id]) continue
			attempted.current.add(job.id)
			void summarize(job).then(() => setAutoSummarized(job.id))
		}
	}, [enabled, pending, queue.jobs, summarize])

	const clearAutoSummarized = useCallback(() => setAutoSummarized(null), [])

	return { enabled, pending, summarize, autoSummarized, clearAutoSummarized }
}
