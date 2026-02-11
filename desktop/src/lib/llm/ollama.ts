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
		prompt: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,

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
