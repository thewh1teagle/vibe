export const modelsDocURL = 'https://thewh1teagle.github.io/vibe/docs/#models'
export const groqConsoleURL = 'https://console.groq.com/keys'
export const storeFilename = 'app_config.json'

export type ModelPresetId = 'small' | 'medium' | 'large'

export interface ModelPreset {
	id: ModelPresetId
	nameKey: string
	descriptionKey: string
	urls: string[]
}

export const modelPresets: ModelPreset[] = [
	{
		id: 'small',
		nameKey: 'common.model-small',
		descriptionKey: 'common.model-small-desc',
		urls: ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true'],
	},
	{
		id: 'medium',
		nameKey: 'common.model-medium',
		descriptionKey: 'common.model-medium-desc',
		urls: ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true'],
	},
	{
		id: 'large',
		nameKey: 'common.model-large',
		descriptionKey: 'common.model-large-desc',
		urls: ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin'],
	},
]

export const defaultModelPresetId: ModelPresetId = 'large'
