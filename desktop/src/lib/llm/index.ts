import { Claude, deafultConfig as defaultClaudeConfig } from './claude'
import { Ollama, defaultConfig as defaultOllamaConfig } from './ollama'

export interface Llm {
	valid(apiKey: string): boolean
	ask(prompt: string): Promise<string>
}

export interface LlmConfig {
	platform: 'ollama' | 'claude'
	enabled: boolean
	prompt: string

	// Claude
	claudeApiKey: string
	model: string
	maxTokens?: number

	// Ollama
	ollamaBaseUrl: string
}

export { Ollama, Claude, defaultClaudeConfig, defaultOllamaConfig }
