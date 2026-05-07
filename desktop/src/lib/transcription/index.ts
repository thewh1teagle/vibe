import * as fs from '@tauri-apps/plugin-fs'
import { basename } from '@tauri-apps/api/path'
import type { Segment } from '~/lib/transcript'

export type TranscriptionProvider = 'local' | 'groq' | 'openai' | 'elevenlabs'

export interface TranscriptionConfig {
	provider: TranscriptionProvider
	groqApiKey: string
	groqModel: string
	openaiApiKey: string
	openaiModel: string
	elevenlabsApiKey: string
	elevenlabsModel: string
}

export interface TranscriptionResult {
	segments: Segment[]
}

export interface CloudTranscriber {
	transcribe(audioPath: string, language?: string): Promise<TranscriptionResult>
}

export function defaultTranscriptionConfig(): TranscriptionConfig {
	return {
		provider: 'local',
		groqApiKey: '',
		groqModel: 'whisper-large-v3',
		openaiApiKey: '',
		openaiModel: 'whisper-1',
		elevenlabsApiKey: '',
		elevenlabsModel: 'scribe_v1',
	}
}

export function createTranscriber(config: TranscriptionConfig): CloudTranscriber | null {
	switch (config.provider) {
		case 'groq':
			return new GroqTranscriber(config.groqApiKey, config.groqModel)
		case 'openai':
			return new OpenAITranscriber(config.openaiApiKey, config.openaiModel)
		case 'elevenlabs':
			return new ElevenLabsTranscriber(config.elevenlabsApiKey, config.elevenlabsModel)
		default:
			return null
	}
}

function getMimeType(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase() ?? 'wav'
	const mimeMap: Record<string, string> = {
		wav: 'audio/wav',
		mp3: 'audio/mpeg',
		m4a: 'audio/mp4',
		ogg: 'audio/ogg',
		opus: 'audio/ogg',
		flac: 'audio/flac',
		webm: 'audio/webm',
	}
	return mimeMap[ext] ?? 'audio/wav'
}

function mapSegments(data: any): Segment[] {
	const segments: Segment[] = (data.segments ?? []).map((s: any) => ({
		start: Math.round((s.start ?? s.from ?? 0) * 100),
		stop: Math.round((s.end ?? s.to ?? 0) * 100),
		text: (s.text ?? '').trim(),
		speaker: s.speaker != null ? Number(s.speaker) : undefined,
	}))

	if (segments.length === 0 && data.text) {
		segments.push({
			start: 0,
			stop: Math.round((data.duration ?? 0) * 100),
			text: data.text.trim(),
		})
	}

	return segments
}

class GroqTranscriber implements CloudTranscriber {
	constructor(private apiKey: string, private model: string) {}

	async transcribe(audioPath: string, language?: string): Promise<TranscriptionResult> {
		const fileData = await fs.readFile(audioPath)
		const fileName = await basename(audioPath)

		const form = new FormData()
		form.append('file', new Blob([fileData], { type: getMimeType(fileName) }), fileName)
		form.append('model', this.model)
		form.append('response_format', 'verbose_json')
		if (language) form.append('language', language)

		const response = await window.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.apiKey}` },
			body: form,
		})

		if (!response.ok) {
			const text = await response.text()
			throw new Error(`Groq API error (${response.status}): ${text}`)
		}

		const data = await response.json()
		return { segments: mapSegments(data) }
	}
}

class OpenAITranscriber implements CloudTranscriber {
	constructor(private apiKey: string, private model: string) {}

	async transcribe(audioPath: string, language?: string): Promise<TranscriptionResult> {
		const fileData = await fs.readFile(audioPath)
		const fileName = await basename(audioPath)

		const form = new FormData()
		form.append('file', new Blob([fileData], { type: getMimeType(fileName) }), fileName)
		form.append('model', this.model)
		form.append('response_format', 'verbose_json')
		if (language) form.append('language', language)

		const response = await window.fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.apiKey}` },
			body: form,
		})

		if (!response.ok) {
			const text = await response.text()
			throw new Error(`OpenAI API error (${response.status}): ${text}`)
		}

		const data = await response.json()
		return { segments: mapSegments(data) }
	}
}

class ElevenLabsTranscriber implements CloudTranscriber {
	constructor(private apiKey: string, private model: string) {}

	async transcribe(audioPath: string, language?: string): Promise<TranscriptionResult> {
		const fileData = await fs.readFile(audioPath)
		const fileName = await basename(audioPath)

		const form = new FormData()
		form.append('file', new Blob([fileData], { type: getMimeType(fileName) }), fileName)
		form.append('model_id', this.model)
		if (language) form.append('language_code', language)

		const response = await window.fetch('https://api.elevenlabs.io/v1/speech-to-text', {
			method: 'POST',
			headers: { 'xi-api-key': this.apiKey },
			body: form,
		})

		if (!response.ok) {
			const text = await response.text()
			throw new Error(`ElevenLabs API error (${response.status}): ${text}`)
		}

		const data = await response.json()
		return { segments: mapSegments(data) }
	}
}