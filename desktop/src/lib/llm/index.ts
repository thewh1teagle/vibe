import { Claude, deafultConfig as defaultClaudeConfig } from './claude'
import { Ollama, defaultConfig as defaultOllamaConfig } from './ollama'
import { OpenAICompatible, defaultConfig as defaultOpenAIConfig } from './openai'

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
	maxTokens?: number

	// Ollama
	ollamaBaseUrl: string

	// OpenAI Compatible
	openaiBaseUrl?: string
	openaiApiKey?: string

	maxInputChars?: number // INPUT char budget per LLM request; triggers chunking when exceeded
}

export { Ollama, Claude, OpenAICompatible, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig }
