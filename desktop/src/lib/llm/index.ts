import { Claude, deafultConfig as defaultClaudeConfig } from './claude'
import { Ollama, defaultConfig as defaultOllamaConfig } from './ollama'
import { OpenAICompatible, defaultConfig as defaultOpenAIConfig } from './openai'
export { DEFAULT_CONTEXT_TOKENS, DEFAULT_MAX_TOKENS, limitPromptToContext, outputTokensForContext } from './context'

export interface Llm {
	ask(prompt: string): Promise<string>
}

export interface LlmConfig {
	platform: 'ollama' | 'claude' | 'openai'
	enabled: boolean
	prompt: string

	// Claude
	claudeApiKey: string
	model: string
	contextTokens?: number
	/** Output limit. Internal for now; the settings UI configures input context separately. */
	maxTokens?: number

	// Ollama
	ollamaBaseUrl: string

	// OpenAI Compatible
	openaiBaseUrl?: string
	openaiApiKey?: string
}

export { Ollama, Claude, OpenAICompatible, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig }
