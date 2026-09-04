// A stand-in model for mock mode: answers the AI endpoints Vibe talks to with a canned,
// streamed reply so the Summary tab, the question thread and the settings Test button can be
// tried in a browser with no key and no server.

const ANSWER = `## Overview

The team reviewed the quarter and agreed to move the launch to **Thursday** so the release notes and the website ship together.

## Key takeaways

- Auto-export is back, written next to each recording.
- Every audio track is now mixed before transcription.
- The theme switch became two icon buttons.

## Action items

- [ ] Publish the changelog page
- [ ] Reply on the batch discussion
`

export function isFakeAiUrl(url: string) {
	return /\/api\/generate$|\/chat\/completions$|api\.anthropic\.com\/v1\/messages$/.test(url)
}

/** The streamed body, one wire line per word, in the format the platform speaks. */
export function fakeAiChunks(url: string, request: string | null): Uint8Array[] {
	const encoder = new TextEncoder()
	let stream = false
	let prompt = ''
	try {
		const body = JSON.parse(request ?? '{}')
		stream = Boolean(body.stream)
		prompt = body.prompt ?? body.messages?.[0]?.content ?? ''
	} catch {
		// no body
	}
	const text = /Reply with the single word OK/.test(prompt)
		? 'OK'
		: /dictated speech/i.test(prompt)
			? 'So, I think we should move the meeting to Thursday. Does that work for everyone?'
			: /Question:/.test(prompt) ? `**Thursday.** The transcript says: "move the meeting to Thursday, does that work for everyone".` : ANSWER
	const words = text.split(/(?<=\s)/)

	if (url.endsWith('/api/generate')) {
		if (!stream) return [encoder.encode(JSON.stringify({ response: text, done: true }))]
		return [...words.map((word) => encoder.encode(JSON.stringify({ response: word }) + '\n')), encoder.encode(JSON.stringify({ done: true }) + '\n')]
	}
	if (url.endsWith('/chat/completions')) {
		if (!stream) return [encoder.encode(JSON.stringify({ choices: [{ message: { content: text } }] }))]
		return [...words.map((word) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`)), encoder.encode('data: [DONE]\n\n')]
	}
	if (!stream) return [encoder.encode(JSON.stringify({ content: [{ text }] }))]
	return [
		encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start' })}\n\n`),
		...words.map((word) => encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: word } })}\n\n`)),
		encoder.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`),
	]
}
