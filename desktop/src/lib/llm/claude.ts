import { fetch } from '@tauri-apps/plugin-http'
import { Llm, LlmConfig } from './index'

export function deafultConfig(language = 'English'): LlmConfig {
	return {
		claudeApiKey: '',
		model: 'claude-sonnet-4-5',
		maxTokens: 8192,
		enabled: false,
		ollamaBaseUrl: '',
		platform: 'claude',
		prompt: `Please summarize the following transcription and write it in ${language}: \n\n"""\n%s\n"""\n`,
	}
}

export class Claude implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const body = JSON.stringify({
			model: this.config.model,
			max_tokens: this.config.maxTokens,
			messages: [{ role: 'user', content: prompt }],
		})
		const headers = {
			Origin: '',
			Referer: '',
			'X-API-Key': this.config.claudeApiKey,
			'anthropic-version': '2023-06-01',
			'Content-Type': 'application/json',
		}
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers,
			body,
		})

		if (!response.ok) {
			console.error(`request details: `, body, headers)
			throw new Error(`Error: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data.content?.[0].text
	}
}
