/*
ollama run llama3.2
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "How are you?",
  "stream": false
}'
*/
import { fetch } from '@tauri-apps/plugin-http'
import type { Llm, LlmConfig } from './index'
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MAX_TOKENS, outputTokensForContext } from './context'

export function defaultConfig(language = 'English') {
	return {
		enabled: false,
		model: 'llama3.2',
		ollamaBaseUrl: 'http://localhost:11434',
		platform: 'ollama',
		prompt: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,
		contextTokens: DEFAULT_CONTEXT_TOKENS,
		maxTokens: DEFAULT_MAX_TOKENS,
		claudeApiKey: '',
	} satisfies LlmConfig
}

export function ollamaRequestBody(config: LlmConfig, prompt: string) {
	const contextTokens = config.contextTokens ?? DEFAULT_CONTEXT_TOKENS
	return {
		model: config.model,
		prompt,
		stream: false,
		options: {
			num_ctx: contextTokens,
			num_predict: outputTokensForContext(contextTokens, config.maxTokens ?? DEFAULT_MAX_TOKENS),
		},
	}
}

export class Ollama implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const body = JSON.stringify(ollamaRequestBody(this.config, prompt))
		const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				// Ollama allowed origins
				// Requires unsafe-headers feature
				Origin: 'http://127.0.0.1',
			},
			body,
		})

		if (!response.ok) {
			console.error(`request details: `, body)
			throw new Error(`Ollama: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data?.response
	}
}
