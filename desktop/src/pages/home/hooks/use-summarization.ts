import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import { useLocalStorage } from 'usehooks-ts'
import { Claude, type Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'

export function useSummarization() {
	const preference = usePreferenceProvider()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizing, setSummarizing] = useState(false)
	const [transcriptTab, setTranscriptTab] = useLocalStorage<'transcript' | 'summary'>('prefs_transcript_tab', 'transcript')

	useEffect(() => {
		const config = preference.llmConfig
		setLlm(config.platform === 'ollama' ? new Ollama(config) : config.platform === 'openai' ? new OpenAICompatible(config) : new Claude(config))
	}, [preference.llmConfig])

	async function summarize(source: transcript.Segment[], prompt: string, showSummary = false) {
		if (!llm) return
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
