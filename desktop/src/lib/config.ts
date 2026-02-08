export const aboutURL = 'https://thewh1teagle.github.io/vibe/'
export const updateVersionURL = 'https://github.com/thewh1teagle/vibe/releases/latest'
export const modelsDocURL = 'https://thewh1teagle.github.io/vibe/docs#models'
export const discordURL = 'https://discord.gg/EcxWSstQN8'
export const unsupportedCpuReadmeURL = 'https://thewh1teagle.github.io/vibe/docs#install'
export const supportVibeURL = 'https://thewh1teagle.github.io/vibe/?action=support-vibe'
export const storeFilename = 'app_config.json'
export const latestReleaseURL = 'https://github.com/thewh1teagle/vibe/releases/latest'
export const latestVersionWithoutVulkan = 'https://github.com/thewh1teagle/vibe/releases/download/v2.4.0/vibe_2.4.0_x64-setup.exe'

export const modelUrls = {
	default: [
		'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
		'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin', // Fallback
	],
	hebrew: ['https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin'],
}

export const embeddingModelFilename = 'wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelFilename = 'segmentation-3.0.onnx'
export const embeddingModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/segmentation-3.0.onnx'

export const diarizeModelFilename = 'diar_streaming_sortformer_4spk-v2.1.onnx'
export const diarizeModelUrl = 'https://huggingface.co/altunenes/parakeet-rs/resolve/main/diar_streaming_sortformer_4spk-v2.1.onnx'

export const llmApiKeyUrl = 'https://console.anthropic.com/settings/keys'
export const llmDefaultMaxTokens = 8192 // https://docs.anthropic.com/en/docs/about-claude/models
export const llmLimitsUrl = 'https://console.anthropic.com/settings/limits'
export const llmCostUrl = 'https://console.anthropic.com/settings/cost'

export const ytDlpAssetNames = {
	windows: 'yt-dlp.exe',
	linux: 'yt-dlp_linux',
	macos: 'yt-dlp_macos',
} as const

export function ytDlpDownloadUrl(version: string, platform: keyof typeof ytDlpAssetNames): string {
	return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${ytDlpAssetNames[platform]}`
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'mxf']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'm4b', 'wma']
export const themes = ['light', 'dark']
