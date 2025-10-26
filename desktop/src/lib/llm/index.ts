import { Claude, deafultConfig as defaultClaudeConfig } from './claude'
import { Ollama, defaultConfig as defaultOllamaConfig } from './ollama'
import { OpenAI, defaultConfig as defaultOpenAIConfig } from './openai'

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

	// OpenAI
	openaiApiUrl: string
}

export { Ollama, Claude, OpenAI, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig }
