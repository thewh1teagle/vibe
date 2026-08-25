import { describe, expect, it } from 'vitest'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '.'
import { CONTEXT_TRUNCATION_MARKER, DEFAULT_CONTEXT_TOKENS, DEFAULT_MAX_TOKENS, limitPromptToContext } from './context'
import { ollamaRequestBody } from './ollama'

describe('LLM context defaults', () => {
	it.each([defaultClaudeConfig, defaultOpenAIConfig, defaultOllamaConfig])('defaults to a 64K context and 8K output', (createConfig) => {
		const config = createConfig()
		expect(config.contextTokens).toBe(DEFAULT_CONTEXT_TOKENS)
		expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS)
	})
})

describe('limitPromptToContext', () => {
	it('leaves prompts within the budget unchanged', () => {
		expect(limitPromptToContext('short prompt')).toBe('short prompt')
	})

	it('truncates deterministically while preserving both ends and valid Unicode', () => {
		const prompt = `instructions\n${'meeting text 😀 '.repeat(5_000)}\nclosing instructions`
		const first = limitPromptToContext(prompt, 8_192, 2_048)
		const second = limitPromptToContext(prompt, 8_192, 2_048)

		expect(first).toBe(second)
		expect(first).toContain(CONTEXT_TRUNCATION_MARKER.trim())
		expect(first).toMatch(/^instructions/)
		expect(first).toMatch(/closing instructions$/)
		expect(first).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
	})
})

describe('ollamaRequestBody', () => {
	it('passes context and output limits as native Ollama options', () => {
		const config = { ...defaultOllamaConfig(), contextTokens: 32_768, maxTokens: 4_096 }
		expect(ollamaRequestBody(config, 'hello')).toMatchObject({
			prompt: 'hello',
			options: { num_ctx: 32_768, num_predict: 4_096 },
		})
	})
})
