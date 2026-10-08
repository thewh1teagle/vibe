export const aboutURL = 'https://thewh1teagle.github.io/vibe/'
export const repoURL = 'https://github.com/thewh1teagle/vibe'
export const updateVersionURL = 'https://github.com/thewh1teagle/vibe/releases/latest'
export const modelsDocURL = 'https://thewh1teagle.github.io/vibe/docs#models'
/**
 * Release notes. With a version it opens that release, otherwise the whole list —
 * the page falls back to English for a release this locale has not translated.
 */
export const changelogURL = (version?: string) => `https://thewh1teagle.github.io/vibe/changelog${version ? `/${version}` : ''}`
export const discordURL = 'https://discord.gg/EcxWSstQN8'
export const supportVibeURL = 'https://thewh1teagle.github.io/vibe/?action=support-vibe'
export const privacyPolicyURL = 'https://thewh1teagle.github.io/vibe/?action=open-privacy-policy'
export const storeFilename = 'app_config.json'

/** What the catalog knows about a finished download, beyond the bytes themselves. */
export interface ModelIntegrity {
	/** Exact size in bytes of the published artifact. */
	size?: number
	/** Lowercase hex SHA-256 of the published artifact. */
	sha256?: string
}

/** One downloadable model. Only catalog entries carry integrity metadata — a URL the user pastes
 * into settings or opens with `vibe://download/?url=` never does, and falls back to the size and
 * magic-byte checks the backend runs on every download. */
export interface ModelDownload extends ModelIntegrity {
	url: string
}

// TODO: fill in `size` and `sha256` for every entry below from the real published artifacts
// (`curl -sI <url>` for the length, `shasum -a 256 <file>` for the hash). They are deliberately
// left unset rather than guessed: a wrong value would reject a perfectly good download.
export const modelUrls: Record<'default' | 'hebrew', ModelDownload[]> = {
	default: [
		{ url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin' },
		{ url: 'https://huggingface.co/vibe-app/whisper-large-v3-turbo-gguf/resolve/main/ggml-large-v3-turbo.bin' }, // Hugging Face fallback
		{ url: 'https://github.com/thewh1teagle/vibe/releases/download/model-files-v1.0/ggml-large-v3-turbo.bin' }, // GitHub fallback
	],
	hebrew: [{ url: 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin' }],
}

/** One downloadable native (FunASR / SenseVoice) model. The GGUF components download individually
 * into a staging folder and the manifest is written on install, so every entry pins exact size and
 * sha256 — a wrong value would reject a perfectly good download. */
export interface NativeModelDownload {
	engine: 'funasr-nano' | 'sensevoice'
	/** Display name shown in the settings download rows. */
	name: string
	/** Written into the installed package manifest. */
	revision: string
	model: ModelDownload
	/** FunASR Nano is a dual-GGUF package; SenseVoice forbids an encoder. */
	encoder?: ModelDownload
}

export const nativeModelDownloads: NativeModelDownload[] = [
	{
		engine: 'sensevoice',
		name: 'SenseVoice Small',
		revision: 'v1-20260916',
		model: {
			url: 'https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF/resolve/main/sensevoice-small-q8.gguf',
			size: 254208320,
			sha256: '4ae45c94422de949b387e2e0fb10d7e14e4c42c69db30c3444ecc7d4b844b7c5',
		},
	},
	{
		engine: 'funasr-nano',
		name: 'FunASR Nano',
		revision: 'v1-20260916',
		model: {
			url: 'https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/main/qwen3-0.6b-q4km.gguf',
			size: 484219776,
			sha256: 'cc5057552aa9dddedcda73ea8889854e8a257eb07d0a561b7234465c1e856f22',
		},
		encoder: {
			url: 'https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/main/funasr-encoder-f16.gguf',
			size: 469331008,
			sha256: 'f92f91d01a24fbed6c863495b2ee8c6a6788144a02858b75743f0946668de8a2',
		},
	},
]

/** Match a URL the user pasted or opened with `vibe://download/?url=` against the native package
 * catalog by component filename, so a magic-install link or a pasted catalog URL installs the
 * whole package instead of dropping a stray GGUF into the models folder. Any component URL —
 * model or encoder — matches its entry; query strings like `?download=true` are ignored. */
export function findNativeModelDownload(url: string): NativeModelDownload | null {
	let filename: string
	try {
		filename = new URL(url).pathname.split('/').pop() ?? ''
	} catch {
		return null
	}
	filename = decodeURIComponent(filename).toLowerCase()
	if (!filename) return null
	const matches = (component: ModelDownload) => decodeURIComponent(new URL(component.url).pathname.split('/').pop() ?? '').toLowerCase() === filename
	return nativeModelDownloads.find((entry) => matches(entry.model) || (entry.encoder !== undefined && matches(entry.encoder))) ?? null
}

export const embeddingModelFilename = 'wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelFilename = 'segmentation-3.0.onnx'
export const embeddingModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/segmentation-3.0.onnx'

/**
 * Diarization runs NVIDIA Sortformer on ggml now, not ONNX Runtime, so this is a GGUF built from
 * the original `.nemo` checkpoint rather than an ONNX export. Q8_0: the k-quant tiers are unsafe
 * for this model — its speaker-cache compression makes discrete near-tie decisions that quant
 * error can flip, permuting speaker labels mid-stream.
 *
 * Mirrored into the vibe-app org from `nvidia/diar_streaming_sortformer_4spk-v2` (cc-by-4.0).
 *
 * Anyone upgrading still has the old `.onnx` sitting in their models folder. Nothing reads it any
 * more and it is not a `.gguf`/`.bin`, so it stays invisible to the model listing; the gate simply
 * finds this file missing and offers the download. Deleting the stale 492 MB file is left to them.
 */
export const diarizeModelFilename = 'diar_streaming_sortformer_4spk-v2.q8_0.gguf'
export const diarizeModelUrl = 'https://huggingface.co/vibe-app/diar-streaming-sortformer-4spk-v2-gguf/resolve/main/diar_streaming_sortformer_4spk-v2.q8_0.gguf'
export const diarizeModelIntegrity: ModelIntegrity = {
	size: 147075776,
	sha256: '0679cfeb1ce356d0dea9470b31274f4bfc7eb927497d82005483770666da998a',
}
export const vadModelFilename = 'ggml-silero-v6.2.0.bin'
export const vadModelUrl = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'

export const llmApiKeyUrl = 'https://console.anthropic.com/settings/keys'
export const llmDefaultMaxTokens = 8192 // https://docs.anthropic.com/en/docs/about-claude/models
export const llmLimitsUrl = 'https://console.anthropic.com/settings/limits'
export const llmCostUrl = 'https://console.anthropic.com/settings/cost'

export const ytDlpAssetNames: Record<string, string> = {
	'windows-x86_64': 'yt-dlp.exe',
	'windows-aarch64': 'yt-dlp_arm64.exe',
	'linux-x86_64': 'yt-dlp_linux',
	'linux-aarch64': 'yt-dlp_linux_aarch64',
	'macos-x86_64': 'yt-dlp_macos',
	'macos-aarch64': 'yt-dlp_macos',
}

export function ytDlpDownloadUrl(version: string, key: string): string {
	return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${ytDlpAssetNames[key]}`
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'mxf']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'm4b', 'wma']
export const themes = ['light', 'dark']
export const defaultAutoSummarizeOnFinish = false

/**
 * Default dictation shortcut: Option+Space on macOS, Ctrl+Space elsewhere. Resolved on call rather
 * than at module scope: reading the platform at import time makes this file unimportable outside a
 * webview (and untestable).
 */
export function getDefaultHotkeyShortcut() {
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	return isMac ? 'Alt+Space' : 'Ctrl+Space'
}

/** Global recording uses one portable accelerator on every desktop platform. */
export function getDefaultRecordingShortcut() {
	return 'CmdOrCtrl+Shift+R'
}
