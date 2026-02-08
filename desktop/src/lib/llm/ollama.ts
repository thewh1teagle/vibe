/*
ollama run llama3.2
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "How are you?",
  "stream": false
}'
*/
import { fetch } from '@tauri-apps/plugin-http'
import { Llm, type LlmConfig } from './index'

export function defaultConfig(language = 'English') {
	return {
		enabled: false,
		model: 'llama3.2',
		ollamaBaseUrl: 'http://localhost:11434',
		platform: 'ollama',
		prompt: `Please summarize the following transcription and write it in ${language}: \n\n"""\n%s\n"""\n`,

		claudeApiKey: '',
	} satisfies LlmConfig
}

export class Ollama implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const body = JSON.stringify({
			model: this.config.model,
			prompt,
			stream: false,
		})
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
			throw new Error(`Claude: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data?.response
	}
}
