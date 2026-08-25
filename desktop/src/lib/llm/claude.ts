import { fetch } from '@tauri-apps/plugin-http'
import type { Llm, LlmConfig } from './index'
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MAX_TOKENS, limitPromptToContext, outputTokensForContext } from './context'

export function deafultConfig(language = 'English'): LlmConfig {
	return {
		claudeApiKey: '',
		model: 'claude-sonnet-4-5',
		contextTokens: DEFAULT_CONTEXT_TOKENS,
		maxTokens: DEFAULT_MAX_TOKENS,
		enabled: false,
		ollamaBaseUrl: '',
		platform: 'claude',
		prompt: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,
	}
}

export class Claude implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const contextTokens = this.config.contextTokens ?? DEFAULT_CONTEXT_TOKENS
		const maxTokens = this.config.maxTokens ?? DEFAULT_MAX_TOKENS
		const body = JSON.stringify({
			model: this.config.model,
			max_tokens: outputTokensForContext(contextTokens, maxTokens),
			messages: [{ role: 'user', content: limitPromptToContext(prompt, contextTokens, maxTokens) }],
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
