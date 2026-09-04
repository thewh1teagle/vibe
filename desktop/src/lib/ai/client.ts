import { fetch } from '@tauri-apps/plugin-http'
import { DEFAULT_AI, PLACEHOLDERS, type AiConnection } from './config'

/** Output ceiling; the input side of the context is what is left after it and a margin. */
const MAX_OUTPUT_TOKENS = 8_192
const SAFETY_TOKENS = 1_024
const BYTES_PER_TOKEN = 4

export interface AiClient {
	/** The whole answer at once. */
	ask(prompt: string): Promise<string>
	/** The answer as it arrives; resolves with the whole text. */
	stream(prompt: string, onToken: (text: string) => void): Promise<string>
}

export function outputTokens(contextTokens: number) {
	return Math.max(1, Math.min(MAX_OUTPUT_TOKENS, Math.floor(contextTokens / 4)))
}

/** Bytes of prompt that fit beside the answer in this context. */
export function inputBudgetBytes(contextTokens: number) {
	return Math.max(1, contextTokens - outputTokens(contextTokens) - SAFETY_TOKENS) * BYTES_PER_TOKEN
}

export function utf8Bytes(value: string) {
	let bytes = 0
	for (const character of value) {
		const code = character.codePointAt(0)!
		bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
	}
	return bytes
}

/** Fill `{transcript}`, `{text}`, `{language}`, `{speakers}`; `%s` still works for old prompts. */
export function fillPrompt(template: string, values: { transcript?: string; text?: string; language?: string; speakers?: string }) {
	const body = values.transcript ?? values.text ?? ''
	return template
		.replace(/%s/g, body)
		.split(PLACEHOLDERS.transcript)
		.join(values.transcript ?? body)
		.split(PLACEHOLDERS.text)
		.join(values.text ?? body)
		.split(PLACEHOLDERS.language)
		.join(values.language ?? '')
		.split(PLACEHOLDERS.speakers)
		.join(values.speakers ?? '')
}

/**
 * Split a transcript's lines into pieces that each fit the context beside the prompt,
 * cutting only between lines. One piece when it all fits.
 */
export function chunkLines(lines: string[], template: string, contextTokens: number): string[] {
	const budget = inputBudgetBytes(contextTokens) - utf8Bytes(template)
	const chunks: string[] = []
	let current: string[] = []
	let size = 0
	for (const line of lines) {
		const bytes = utf8Bytes(line) + 1
		if (size + bytes > budget && current.length > 0) {
			chunks.push(current.join('\n'))
			current = []
			size = 0
		}
		current.push(line)
		size += bytes
	}
	if (current.length > 0) chunks.push(current.join('\n'))
	return chunks.length > 0 ? chunks : ['']
}

/** Read an SSE or NDJSON body line by line. */
async function readLines(response: Response, onLine: (line: string) => void) {
	const reader = response.body?.getReader()
	if (!reader) {
		onLine(await response.text())
		return
	}
	const decoder = new TextDecoder()
	let buffer = ''
	for (;;) {
		const { value, done } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		let newline = buffer.indexOf('\n')
		while (newline >= 0) {
			onLine(buffer.slice(0, newline).replace(/\r$/, ''))
			buffer = buffer.slice(newline + 1)
			newline = buffer.indexOf('\n')
		}
	}
	if (buffer) onLine(buffer)
}

async function failure(label: string, response: Response) {
	let detail = ''
	try {
		const text = await response.text()
		try {
			const json = JSON.parse(text)
			detail = json?.error?.message ?? json?.error ?? text
		} catch {
			detail = text
		}
	} catch {
		// no body
	}
	return new Error(`${label}: ${response.status} ${response.statusText}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`)
}

/** Ollama's `/api/generate`; llmman serves the same API, so it is the same client with another base URL. */
class Ollama implements AiClient {
	constructor(
		private connection: AiConnection,
		private label = 'Ollama',
		private baseUrl = connection.ollamaBaseUrl,
	) {}
	private url() {
		return `${this.baseUrl.replace(/\/+$/, '')}/api/generate`
	}
	private body(prompt: string, stream: boolean) {
		return JSON.stringify({
			model: this.connection.model,
			prompt,
			stream,
			options: { num_ctx: this.connection.contextTokens, num_predict: outputTokens(this.connection.contextTokens) },
		})
	}
	private headers() {
		// Ollama checks Origin; the plugin's unsafe-headers feature lets us set it.
		return { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1' }
	}
	async ask(prompt: string) {
		const response = await fetch(this.url(), { method: 'POST', headers: this.headers(), body: this.body(prompt, false) })
		if (!response.ok) throw await failure(this.label, response)
		return (await response.json())?.response ?? ''
	}
	async stream(prompt: string, onToken: (text: string) => void) {
		const response = await fetch(this.url(), { method: 'POST', headers: this.headers(), body: this.body(prompt, true) })
		if (!response.ok) throw await failure(this.label, response)
		let text = ''
		await readLines(response, (line) => {
			if (!line.trim()) return
			try {
				const piece = JSON.parse(line)?.response
				if (piece) {
					text += piece
					onToken(piece)
				}
			} catch {
				// a partial line; the next read completes it
			}
		})
		return text
	}
}

class OpenAICompatible implements AiClient {
	constructor(private connection: AiConnection) {}
	private url() {
		return `${(this.connection.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`
	}
	private headers() {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' }
		if (this.connection.openaiApiKey) headers.Authorization = `Bearer ${this.connection.openaiApiKey}`
		return headers
	}
	private body(prompt: string, stream: boolean) {
		return JSON.stringify({
			model: this.connection.model,
			max_tokens: outputTokens(this.connection.contextTokens),
			stream,
			messages: [{ role: 'user', content: prompt }],
		})
	}
	async ask(prompt: string) {
		const response = await fetch(this.url(), { method: 'POST', headers: this.headers(), body: this.body(prompt, false) })
		if (!response.ok) throw await failure('OpenAI', response)
		return (await response.json()).choices?.[0]?.message?.content ?? ''
	}
	async stream(prompt: string, onToken: (text: string) => void) {
		const response = await fetch(this.url(), { method: 'POST', headers: this.headers(), body: this.body(prompt, true) })
		if (!response.ok) throw await failure('OpenAI', response)
		let text = ''
		await readLines(response, (line) => {
			if (!line.startsWith('data:')) return
			const data = line.slice(5).trim()
			if (data === '[DONE]') return
			try {
				const piece = JSON.parse(data).choices?.[0]?.delta?.content
				if (piece) {
					text += piece
					onToken(piece)
				}
			} catch {
				// keep-alive or partial line
			}
		})
		return text
	}
}

class Claude implements AiClient {
	constructor(private connection: AiConnection) {}
	private headers() {
		return { Origin: '', Referer: '', 'X-API-Key': this.connection.claudeApiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
	}
	private body(prompt: string, stream: boolean) {
		return JSON.stringify({
			model: this.connection.model,
			max_tokens: outputTokens(this.connection.contextTokens),
			stream,
			messages: [{ role: 'user', content: prompt }],
		})
	}
	async ask(prompt: string) {
		const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: this.headers(), body: this.body(prompt, false) })
		if (!response.ok) throw await failure('Claude', response)
		return (await response.json()).content?.[0]?.text ?? ''
	}
	async stream(prompt: string, onToken: (text: string) => void) {
		const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: this.headers(), body: this.body(prompt, true) })
		if (!response.ok) throw await failure('Claude', response)
		let text = ''
		await readLines(response, (line) => {
			if (!line.startsWith('data:')) return
			try {
				const event = JSON.parse(line.slice(5).trim())
				const piece = event?.type === 'content_block_delta' ? event.delta?.text : undefined
				if (piece) {
					text += piece
					onToken(piece)
				}
			} catch {
				// partial line
			}
		})
		return text
	}
}

export function createClient(connection: AiConnection): AiClient {
	if (connection.platform === 'ollama') return new Ollama(connection)
	// Settings saved before llmman existed have no URL for it; fall back to its default port.
	if (connection.platform === 'llmman') return new Ollama(connection, 'llmman', connection.llmmanBaseUrl || DEFAULT_AI.connection.llmmanBaseUrl)
	if (connection.platform === 'openai') return new OpenAICompatible(connection)
	return new Claude(connection)
}

/** One tiny round trip: how long it took, or the exact error, before anyone waits on a summary. */
export async function testConnection(connection: AiConnection): Promise<{ ok: true; ms: number; reply: string } | { ok: false; error: string }> {
	const started = performance.now()
	try {
		const reply = await createClient(connection).ask('Reply with the single word OK.')
		return { ok: true, ms: Math.round(performance.now() - started), reply: reply.trim().slice(0, 40) }
	} catch (error) {
		return { ok: false, error: String(error instanceof Error ? error.message : error) }
	}
}
