import { llmDefaultMaxInputChars } from '~/lib/config'
import { type Llm, type LlmConfig } from '~/lib/llm'
import { asText, type Segment } from '~/lib/transcript'

function splitIntoChunks(segments: Segment[], maxCharsPerChunk: number, speakerLabel: string): Segment[][] {
	const chunks: Segment[][] = []
	let current: Segment[] = []
	let currentLen = 0

	for (const segment of segments) {
		const segText = (segment.speaker != null ? `[${speakerLabel} ${segment.speaker + 1}] ` : '') + segment.text.trim() + '\n'
		const segLen = segText.length

		if (segLen > maxCharsPerChunk) {
			// Oversized single segment — place it alone
			if (current.length > 0) {
				chunks.push(current)
				current = []
				currentLen = 0
			}
			chunks.push([segment])
			continue
		}

		if (currentLen + segLen > maxCharsPerChunk && current.length > 0) {
			chunks.push(current)
			current = []
			currentLen = 0
		}
		current.push(segment)
		currentLen += segLen
	}
	if (current.length > 0) chunks.push(current)
	return chunks
}

function buildChunkPrompt(promptTemplate: string, chunkText: string, previousSummary: string | null, chunkIndex: number, totalChunks: number): string {
	const base = promptTemplate.replace('%s', chunkText)
	if (!previousSummary) {
		return base
	}
	return `Summary of previous sections (use as context, do not repeat verbatim):\n${previousSummary}\n\nNow summarize section ${chunkIndex + 1} of ${totalChunks}:\n${base}`
}

function buildSynthesisPrompt(partials: string[]): string {
	const combined = partials.map((s, i) => `### Part ${i + 1}\n${s}`).join('\n\n')
	return `You are combining ${partials.length} partial summaries of consecutive sections of a single transcript into one coherent final summary.

Synthesize them into a unified summary that:
- Preserves all key topics, decisions, and action items from every part
- Eliminates repetition
- Follows the same markdown format as the partial summaries
- Reads as if the entire transcript were summarized in one pass

${combined}`
}

export async function summarizeWithChunking(llm: Llm, segments: Segment[], config: LlmConfig, speakerLabel: string): Promise<string> {
	const maxInputChars = config.maxInputChars ?? llmDefaultMaxInputChars
	const promptTemplate = config.prompt
	const promptOverhead = promptTemplate.replace('%s', '').length
	const maxCharsPerChunk = maxInputChars - promptOverhead

	const fullText = asText(segments, speakerLabel)

	// Fast path — fits in one request (current behavior)
	if (fullText.length <= maxCharsPerChunk) {
		return llm.ask(promptTemplate.replace('%s', fullText))
	}

	// Chunk mode
	const chunks = splitIntoChunks(segments, maxCharsPerChunk, speakerLabel)

	if (chunks.length <= 1) {
		// Edge case: can't split further, send as-is
		return llm.ask(promptTemplate.replace('%s', fullText))
	}

	// Summarize each chunk sequentially, passing the previous summary as rolling context
	const partials: string[] = []
	let previousSummary: string | null = null
	for (let i = 0; i < chunks.length; i++) {
		const chunkText = asText(chunks[i], speakerLabel)
		const prompt = buildChunkPrompt(promptTemplate, chunkText, previousSummary, i, chunks.length)
		const partial = await llm.ask(prompt)
		partials.push(partial)
		previousSummary = partial
	}

	// Synthesize all partials into a single coherent summary
	return llm.ask(buildSynthesisPrompt(partials))
}
