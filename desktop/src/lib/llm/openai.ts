import { fetch } from '@tauri-apps/plugin-http'
import { Llm, type LlmConfig } from './index'

export function defaultConfig(language = 'English'): LlmConfig {
	return {
		enabled: false,
		model: 'gpt-4o-mini',
		platform: 'openai',
		prompt: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,
		maxTokens: 8192,
		claudeApiKey: '',
		ollamaBaseUrl: '',
		openaiBaseUrl: 'https://api.openai.com/v1',
		openaiApiKey: '',
	}
}

export function defaultGeminiConfig(language = 'English'): LlmConfig {
	return {
		...defaultConfig(language),
		platform: 'gemini',
		model: 'gemini-2.5-flash',
		openaiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
	}
}

export class OpenAICompatible implements Llm {
	private config: LlmConfig

	constructor(config: LlmConfig) {
		this.config = config
	}

	async ask(prompt: string): Promise<string> {
		const isGemini = this.config.platform === 'gemini'
		const model = this.config.model?.trim()
		if (!model) {
			throw new Error('LLM model is required.')
		}
		if (isGemini && !/^gemini([\w.-]*)$/i.test(model)) {
			throw new Error('Gemini provider expects a model like `gemini-2.5-flash`.')
		}

		const rawBaseUrl = this.config.openaiBaseUrl?.trim() || (isGemini ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : 'https://api.openai.com/v1')
		const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
		if (!baseUrl) {
			throw new Error('OpenAI compatible base URL is required.')
		}
		if (isGemini && !/generativelanguage\.googleapis\.com/i.test(baseUrl)) {
			throw new Error('Gemini provider requires a Google AI Studio OpenAI-compatible base URL.')
		}

		const apiKey = this.config.openaiApiKey?.trim()
		if (isGemini && !apiKey) {
			throw new Error('Gemini provider requires a Google AI Studio API key.')
		}

		const bodyData: Record<string, unknown> = {
			model,
			messages: [{ role: 'user', content: prompt }],
		}
		if (!isGemini && typeof this.config.maxTokens === 'number') {
			bodyData.max_tokens = this.config.maxTokens
		}
		const body = JSON.stringify(bodyData)
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`
		}
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers,
			body,
		})

		if (!response.ok) {
			const errorText = await response.text()
			let errorDetails: string
			try {
				const parsed = JSON.parse(errorText)
				errorDetails = parsed?.error?.message || parsed?.message || errorText || response.statusText
			} catch {
				errorDetails = errorText || response.statusText
			}
			throw new Error(`OpenAI Compatible (${this.config.platform}): ${response.status} - ${errorDetails}`)
		}

		const data = await response.json()
		const content = data.choices?.[0]?.message?.content
		if (typeof content === 'string') return content
		if (Array.isArray(content)) {
			return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
		}
		return ''
	}
}
