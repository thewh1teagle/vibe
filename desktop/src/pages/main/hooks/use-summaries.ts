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
	/** Last failure for a job; cleared as soon as a retry begins. */
	errors: Record<string, string>
	summarize: (job: Job, prompt?: string) => Promise<boolean>
	/** Job whose summary arrived on its own, so the view can switch to it once. */
	autoSummarized: string | null
	clearAutoSummarized: () => void
}

export function shouldAutoSummarize(job: Pick<Job, 'status' | 'hydrated' | 'summary' | 'segments'>, previousStatus?: Job['status']) {
	return previousStatus !== undefined && previousStatus !== 'done' && job.status === 'done' && !job.hydrated && !job.summary && job.segments.length > 0
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
	const [errors, setErrors] = useState<Record<string, string>>({})
	// State updates are not synchronous; this set closes the gap where two callers can start the
	// same job before `pending` renders.
	const inFlight = useRef<Set<string>>(new Set())
	const autoAttempted = useRef<Set<string>>(new Set())
	const previousStatuses = useRef<Map<string, Job['status']>>(new Map())

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
			if (!llm || !template || !job.segments.length || inFlight.current.has(job.id)) return false
			inFlight.current.add(job.id)
			setPending((previous) => ({ ...previous, [job.id]: true }))
			setErrors((previous) => {
				const next = { ...previous }
				delete next[job.id]
				return next
			})
			try {
				const question = template.replace('%s', asText(job.segments, m.speakerPrefix(), job.speakerNames))
				const answer = llm.ask(question).then((value) => {
					const text = value?.trim()
					if (!text) throw new Error(m.summaryFailed())
					return text
				})
				toast.promise(answer, {
					loading: m.summarizeLoading(),
					error: m.summaryFailed(),
					success: m.summarizeSuccess(),
					position: 'bottom-center',
				})
				const text = await answer
				queue.setJobSummary(job.id, text)
				return true
			} catch (error) {
				console.error('summarize failed:', error)
				setErrors((previous) => ({ ...previous, [job.id]: String(error) }))
				return false
			} finally {
				inFlight.current.delete(job.id)
				setPending((previous) => {
					const next = { ...previous }
					delete next[job.id]
					return next
				})
			}
		},
		[config?.prompt, llm, queue],
	)

	// Auto-run only on a real status transition in this session. Turning the setting on later must
	// not sweep over already-finished work, and hydrated projects are always manual-only.
	useEffect(() => {
		const completed: Job[] = []
		const liveIds = new Set<string>()
		for (const job of queue.jobs) {
			liveIds.add(job.id)
			const previous = previousStatuses.current.get(job.id)
			if (shouldAutoSummarize(job, previous)) completed.push(job)
			previousStatuses.current.set(job.id, job.status)
		}
		for (const id of previousStatuses.current.keys()) {
			if (!liveIds.has(id)) previousStatuses.current.delete(id)
		}

		if (!enabled || !preference.autoSummarizeOnFinish) return
		for (const job of completed) {
			if (autoAttempted.current.has(job.id)) continue
			autoAttempted.current.add(job.id)
			void summarize(job).then((succeeded) => {
				if (succeeded) setAutoSummarized(job.id)
			})
		}
	}, [enabled, preference.autoSummarizeOnFinish, queue.jobs, summarize])

	const clearAutoSummarized = useCallback(() => setAutoSummarized(null), [])

	return { enabled, pending, errors, summarize, autoSummarized, clearAutoSummarized }
}
