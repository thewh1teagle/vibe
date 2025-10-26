import { fetch } from '@tauri-apps/plugin-http'
import { Llm, type LlmConfig } from './index'

export function defaultConfig() {
	return {
		enabled: false,
		model: 'qwen3-next-80b-a3b-instruct',
		openaiApiUrl: 'http://localhost:1234/v1',
		platform: 'openai',
		prompt: `Please summarize the following transcription: \n\n"""\n%s\n"""\n`,

		claudeApiKey: '',
		ollamaBaseUrl: '',
	} satisfies LlmConfig
}

export class OpenAI implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const baseUrl = this.config.openaiApiUrl.replace(/\/$/, '')
		const url = `${baseUrl}/completions`
		const body = JSON.stringify({
			model: this.config.model,
			prompt: prompt,
			stream: false,
		})

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body,
		})

		if (!response.ok) {
			console.error(`request details: `, body)
			throw new Error(`OpenAI: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data?.choices?.[0]?.text || data?.choices?.[0]?.message?.content
	}
}
