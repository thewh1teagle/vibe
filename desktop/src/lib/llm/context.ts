export const DEFAULT_CONTEXT_TOKENS = 65_536
export const DEFAULT_MAX_TOKENS = 8_192

const BYTES_PER_APPROXIMATE_TOKEN = 4
const PROMPT_SAFETY_TOKENS = 1_024
export const CONTEXT_TRUNCATION_MARKER = '\n\n[Transcript truncated to fit the configured context size.]\n\n'

function utf8Length(value: string) {
	let bytes = 0
	for (const character of value) {
		const codePoint = character.codePointAt(0)!
		bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
	}
	return bytes
}

function takePrefix(value: string, maxBytes: number) {
	let bytes = 0
	let result = ''
	for (const character of value) {
		const characterBytes = utf8Length(character)
		if (bytes + characterBytes > maxBytes) break
		result += character
		bytes += characterBytes
	}
	return result
}

function takeSuffix(value: string, maxBytes: number) {
	const characters = Array.from(value)
	let bytes = 0
	let start = characters.length
	while (start > 0) {
		const characterBytes = utf8Length(characters[start - 1])
		if (bytes + characterBytes > maxBytes) break
		bytes += characterBytes
		start -= 1
	}
	return characters.slice(start).join('')
}

/** Keep output useful at small context sizes while retaining the normal 8K ceiling. */
export function outputTokensForContext(contextTokens = DEFAULT_CONTEXT_TOKENS, maxTokens = DEFAULT_MAX_TOKENS) {
	const normalizedContext = Math.max(1, Math.floor(contextTokens))
	return Math.max(1, Math.min(maxTokens, Math.floor(normalizedContext / 4)))
}

/**
 * Conservatively approximates tokens from UTF-8 bytes and preserves both ends of the composed
 * prompt. Iterating by code point ensures truncation never leaves an unmatched UTF-16 surrogate.
 */
export function limitPromptToContext(prompt: string, contextTokens = DEFAULT_CONTEXT_TOKENS, maxTokens = DEFAULT_MAX_TOKENS) {
	const outputTokens = outputTokensForContext(contextTokens, maxTokens)
	const inputTokens = Math.max(1, contextTokens - outputTokens - PROMPT_SAFETY_TOKENS)
	const maxBytes = inputTokens * BYTES_PER_APPROXIMATE_TOKEN
	if (utf8Length(prompt) <= maxBytes) return prompt

	const markerBytes = utf8Length(CONTEXT_TRUNCATION_MARKER)
	if (markerBytes >= maxBytes) return takePrefix(CONTEXT_TRUNCATION_MARKER, maxBytes)
	const contentBytes = Math.max(0, maxBytes - markerBytes)
	const headBytes = Math.floor(contentBytes * 0.8)
	return `${takePrefix(prompt, headBytes)}${CONTEXT_TRUNCATION_MARKER}${takeSuffix(prompt, contentBytes - headBytes)}`
}
