import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { appLanguageName, chunkLines, createClient, fillPrompt, inputBudgetBytes, utf8Bytes, type AiClient } from '~/lib/ai'
import { asText } from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job, TranscribeQueue } from './use-transcribe-queue'

export interface SummaryProgress {
	/** Parts finished so far, out of `total`, when the transcript had to be summarized in parts. */
	done: number
	total: number
}

export interface Summaries {
	/** The summary task is switched on in settings. */
	enabled: boolean
	/** Job ids currently waiting on the model. */
	pending: Record<string, boolean>
	/** Text of a summary as it streams in, by job id, until it is saved. */
	drafts: Record<string, string>
	/** Part counts for transcripts too long for one request. */
	progress: Record<string, SummaryProgress>
	/** Last failure for a job; cleared as soon as a retry begins. */
	errors: Record<string, string>
	summarize: (job: Job, prompt?: string) => Promise<boolean>
	/** Ask a question about the transcript; the answer streams into `answerDrafts` and then the thread. */
	ask: (job: Job, question: string) => Promise<boolean>
	/** The answer being written for a job, while it streams. */
	answerDrafts: Record<string, string>
	/** Job ids waiting on an answer. */
	asking: Record<string, boolean>
	removeThreadEntry: (job: Job, index: number) => void
	/** Job whose summary just started or arrived, so the view can switch to it once. */
	showSummary: string | null
	clearShowSummary: () => void
}

export function shouldAutoSummarize(job: Pick<Job, 'status' | 'hydrated' | 'summary' | 'segments'>, previousStatus?: Job['status']) {
	return previousStatus !== undefined && previousStatus !== 'done' && job.status === 'done' && !job.hydrated && !job.summary && job.segments.length > 0
}

/** Summarize the partial summaries; the model sees them as the transcript so the user's prompt still applies. */
function joinParts(parts: string[]) {
	return parts.map((part, index) => `--- Part ${index + 1} of ${parts.length} ---\n${part}`).join('\n\n')
}

function useRecord<T>() {
	const [record, setRecord] = useState<Record<string, T>>({})
	const set = useCallback((id: string, value: T) => setRecord((previous) => ({ ...previous, [id]: value })), [])
	const clear = useCallback(
		(id: string) =>
			setRecord((previous) => {
				if (!(id in previous)) return previous
				const next = { ...previous }
				delete next[id]
				return next
			}),
		[],
	)
	return [record, set, clear] as const
}

/**
 * Runs the AI summary task over a finished transcript. A transcription made in this session is
 * summarized as soon as it finishes when the switch says so; transcripts opened from the store are
 * summarized on demand from the toolbar. Long transcripts are summarized in parts and the parts
 * summarized again, so a five-hour recording works on a small context.
 */
export function useSummaries(queue: TranscribeQueue): Summaries {
	const preference = usePreferenceProvider()
	const [pending, setPendingFor, clearPending] = useRecord<boolean>()
	const [drafts, setDraft, clearDraft] = useRecord<string>()
	const [progress, setProgressFor, clearProgress] = useRecord<SummaryProgress>()
	const [errors, setError, clearError] = useRecord<string>()
	const [answerDrafts, setAnswerDraft, clearAnswerDraft] = useRecord<string>()
	const [asking, setAskingFor, clearAsking] = useRecord<boolean>()
	const [showSummary, setShowSummary] = useState<string | null>(null)
	// State updates are not synchronous; these sets close the gap where two callers can start the
	// same job before `pending` renders.
	const inFlight = useRef<Set<string>>(new Set())
	const autoAttempted = useRef<Set<string>>(new Set())
	const previousStatuses = useRef<Map<string, Job['status']>>(new Map())

	const { connection, tasks } = preference.ai
	const task = tasks.summary
	const enabled = task.enabled
	const client = useMemo<AiClient>(() => createClient(connection), [connection])

	const transcriptOf = useCallback((job: Job) => asText(job.segments, m.speakerPrefix(), job.speakerNames), [])
	const speakersOf = useCallback((job: Job) => Object.values(job.speakerNames ?? {}).join(', '), [])

	const summarize = useCallback(
		async (job: Job, prompt?: string) => {
			const template = prompt ?? task.prompt
			if (!template.trim() || !job.segments.length || inFlight.current.has(job.id)) return false
			inFlight.current.add(job.id)
			setPendingFor(job.id, true)
			clearError(job.id)
			setDraft(job.id, '')
			setShowSummary(job.id)
			try {
				const values = { language: appLanguageName(), speakers: speakersOf(job) }
				const frame = fillPrompt(template, { ...values, transcript: '' })
				const chunks = chunkLines(transcriptOf(job).split('\n'), frame, connection.contextTokens)
				let source = chunks[0]
				if (chunks.length > 1) {
					const parts: string[] = []
					for (const [index, chunk] of chunks.entries()) {
						setProgressFor(job.id, { done: index, total: chunks.length })
						parts.push((await client.ask(fillPrompt(template, { ...values, transcript: chunk }))).trim())
					}
					setProgressFor(job.id, { done: chunks.length, total: chunks.length })
					source = joinParts(parts)
				}
				let text = ''
				await client.stream(fillPrompt(template, { ...values, transcript: source }), (token) => {
					text += token
					setDraft(job.id, text)
				})
				text = text.trim()
				if (!text) throw new Error(m.summaryFailed())
				queue.setJobSummary(job.id, text)
				return true
			} catch (error) {
				console.error('summarize failed:', error)
				setError(job.id, String(error instanceof Error ? error.message : error))
				toast.error(m.summaryFailed(), { position: 'bottom-center' })
				return false
			} finally {
				inFlight.current.delete(job.id)
				clearPending(job.id)
				clearProgress(job.id)
				clearDraft(job.id)
			}
		},
		[
			task.prompt,
			connection.contextTokens,
			client,
			queue,
			transcriptOf,
			speakersOf,
			setPendingFor,
			clearError,
			setDraft,
			setProgressFor,
			setError,
			clearPending,
			clearProgress,
			clearDraft,
		],
	)

	const ask = useCallback(
		async (job: Job, question: string) => {
			const trimmed = question.trim()
			if (!trimmed || inFlight.current.has(`ask:${job.id}`)) return false
			inFlight.current.add(`ask:${job.id}`)
			setAskingFor(job.id, true)
			setAnswerDraft(job.id, '')
			try {
				// The whole transcript when it fits, otherwise the summary, which the model can still
				// answer most questions from.
				const transcript = transcriptOf(job)
				const fits = utf8Bytes(transcript) < inputBudgetBytes(connection.contextTokens) - 2_000
				const context = fits ? transcript : (job.summary ?? transcript.slice(0, inputBudgetBytes(connection.contextTokens) - 2_000))
				const history = (job.thread ?? []).map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`).join('\n\n')
				const prompt = [
					`Answer the question about this transcript in ${appLanguageName()}, using markdown. Be direct and specific; quote the transcript where it helps. If the transcript does not say, say so.`,
					`Transcript${fits ? '' : ' (summary)'}:\n"""\n${context}\n"""`,
					history ? `Earlier questions:\n${history}` : '',
					`Question: ${trimmed}`,
				]
					.filter(Boolean)
					.join('\n\n')
				let text = ''
				await client.stream(prompt, (token) => {
					text += token
					setAnswerDraft(job.id, text)
				})
				text = text.trim()
				if (!text) throw new Error(m.summaryFailed())
				const current = queue.jobs.find((candidate) => candidate.id === job.id)
				queue.setJobThread(job.id, [...(current?.thread ?? job.thread ?? []), { question: trimmed, answer: text }])
				return true
			} catch (error) {
				console.error('ask failed:', error)
				toast.error(m.askFailed(), { position: 'bottom-center' })
				return false
			} finally {
				inFlight.current.delete(`ask:${job.id}`)
				clearAsking(job.id)
				clearAnswerDraft(job.id)
			}
		},
		[client, connection.contextTokens, queue, transcriptOf, setAskingFor, setAnswerDraft, clearAsking, clearAnswerDraft],
	)

	const removeThreadEntry = useCallback(
		(job: Job, index: number) => {
			const thread = job.thread ?? []
			queue.setJobThread(
				job.id,
				thread.filter((_, position) => position !== index),
			)
		},
		[queue],
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

		if (!enabled || !task.autoOnFinish) return
		for (const job of completed) {
			if (autoAttempted.current.has(job.id)) continue
			autoAttempted.current.add(job.id)
			void summarize(job)
		}
	}, [enabled, task.autoOnFinish, queue.jobs, summarize])

	const clearShowSummary = useCallback(() => setShowSummary(null), [])

	return { enabled, pending, drafts, progress, errors, summarize, ask, answerDrafts, asking, removeThreadEntry, showSummary, clearShowSummary }
}
