import { fetch } from '@tauri-apps/plugin-http'

export interface LlmOptions {
	apiKey?: string
	enabled: boolean
	prompt: string
	maxTokens: number
}

export async function promptValid(prompt: string) {
	return prompt.includes('%s')
}

export async function apiKeyValid(key: string): Promise<boolean> {
	const res = await askLlm(key, 'hi', 5)
	console.log('res => ', res)
	return res != ''
}

export async function askLlm(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
	try {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'X-API-Key': apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'claude-3-5-sonnet-20240620',
				max_tokens: maxTokens,
				messages: [{ role: 'user', content: prompt }],
			}),
		})

		if (!response.ok) {
			throw new Error(`Error: ${response.status} - ${response.statusText}`)
		}

		const data = await response.json()
		return data.content?.[0].text
	} catch (error) {
		console.error('Error asking Claude:', error)
		return ''
	}
}
