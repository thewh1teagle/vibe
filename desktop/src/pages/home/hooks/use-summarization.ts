import { useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'
import { Claude, type Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'

export function useSummarization() {
	const preference = usePreferenceProvider()
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizing, setSummarizing] = useState(false)
	const [transcriptTab, setTranscriptTab] = usePersisted<'transcript' | 'summary'>(CONFIG_KEYS.transcriptTab, 'transcript')

	// Built during render rather than in an effect: a recording that finishes fast could call
	// summarize() before the effect had set the client, and the run was dropped in silence (#983).
	const llm = useMemo<Llm>(() => {
		const config = preference.llmConfig
		return config.platform === 'ollama' ? new Ollama(config) : config.platform === 'openai' ? new OpenAICompatible(config) : new Claude(config)
	}, [preference.llmConfig])

	async function summarize(source: transcript.Segment[], prompt: string, showSummary = false) {
		setSummarizing(true)
		try {
			const question = prompt.replace('%s', transcript.asText(source, m.speakerPrefix()))
			const answerPromise = llm.ask(question)
			toast.promise(answerPromise, {
				loading: m.summarizeLoading(),
				error: (error) => String(error),
				success: m.summarizeSuccess(),
			})
			const answer = await answerPromise
			if (answer) {
				setSegments([{ start: 0, stop: source[source.length - 1]?.stop ?? 0, text: answer }])
				if (showSummary) setTranscriptTab('summary')
			}
		} catch (error) {
			console.error(error)
		} finally {
			setSummarizing(false)
		}
	}

	return {
		segments,
		setSegments,
		summarizing,
		transcriptTab,
		setTranscriptTab,
		summarize,
	}
}
