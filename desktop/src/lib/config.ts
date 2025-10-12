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

export const llmApiKeyUrl = 'https://console.anthropic.com/settings/keys'
export const llmDefaultMaxTokens = 8192 // https://docs.anthropic.com/en/docs/about-claude/models
export const llmLimitsUrl = 'https://console.anthropic.com/settings/limits'
export const llmCostUrl = 'https://console.anthropic.com/settings/cost'

export const ytDlpVersion = '2025.01.150'
export const ytDlpConfig = {
	windows: {
		url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp.exe', // signed with self certificate. better than nothing
		name: 'yt-dlp.exe',
	},
	linux: {
		url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp_linux',
		name: 'yt-dlp_linux',
	},
	macos: {
		// Universal binary
		url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp_macos',
		name: 'yt-dlp_macos',
	},
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'wma']
export const themes = ['light', 'dark']
