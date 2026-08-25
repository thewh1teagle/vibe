import { fetch } from '@tauri-apps/plugin-http'
import type { Llm, LlmConfig } from './index'
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MAX_TOKENS, limitPromptToContext, outputTokensForContext } from './context'

export function defaultConfig(language = 'English'): LlmConfig {
	return {
		enabled: false,
		model: 'gpt-4o-mini',
		platform: 'openai',
		prompt: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,
		contextTokens: DEFAULT_CONTEXT_TOKENS,
		maxTokens: DEFAULT_MAX_TOKENS,
		claudeApiKey: '',
		ollamaBaseUrl: '',
		openaiBaseUrl: 'https://api.openai.com/v1',
		openaiApiKey: '',
	}
}

export class OpenAICompatible implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const baseUrl = (this.config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
		const contextTokens = this.config.contextTokens ?? DEFAULT_CONTEXT_TOKENS
		const maxTokens = this.config.maxTokens ?? DEFAULT_MAX_TOKENS
		const body = JSON.stringify({
			model: this.config.model,
			max_tokens: outputTokensForContext(contextTokens, maxTokens),
			messages: [{ role: 'user', content: limitPromptToContext(prompt, contextTokens, maxTokens) }],
		})
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (this.config.openaiApiKey) {
			headers['Authorization'] = `Bearer ${this.config.openaiApiKey}`
		}
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers,
			body,
		})

		if (!response.ok) {
			console.error(`request details: `, body)
			throw new Error(`OpenAI Compatible: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data.choices?.[0]?.message?.content ?? ''
	}
}
