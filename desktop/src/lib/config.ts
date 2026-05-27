export const modelsDocURL = 'https://thewh1teagle.github.io/vibe/docs#models'
export const storeFilename = 'app_config.json'

export const modelUrls = {
	default: [
		'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
		'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin', // Fallback
	],
	hebrew: ['https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin'],
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'mxf']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'm4b', 'wma']
