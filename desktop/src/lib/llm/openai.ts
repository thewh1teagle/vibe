import { fetch } from '@tauri-apps/plugin-http'
import { Llm, LlmConfig } from './index'

export function defaultConfig(): LlmConfig {
    return {
        enabled: false,
        platform: 'openai',
        model: 'gpt-3.5-turbo',
        openaiApiKey: '',
        openaiBaseUrl: 'https://api.openai.com/v1',
        prompt: `Please summarize the following transcription: \n\n"""\n%s\n"""\n`,
        claudeApiKey: '',
        ollamaBaseUrl: '',
    }
}

export class OpenAI implements Llm {
    private config: LlmConfig

    constructor(config: LlmConfig) {
        this.config = config
    }

    async ask(prompt: string): Promise<string> {
        const body = JSON.stringify({
            model: this.config.model,
            messages: [{ role: 'user', content: prompt }],
            stream: false
        })
        const headers = {
            'Authorization': `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
        }
        const response = await fetch(`${this.config.openaiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body,
        })
        const data = await response.json()
        return data.choices?.[0]?.message?.content || ''
    }
}
