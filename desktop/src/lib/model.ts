import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import { diarizeModelFilename, embeddingModelFilename, segmentModelFilename, vadModelFilename, type ModelDownload, type ModelIntegrity } from './config'
import { NamedPath } from './types'

export const MODEL_EXTENSIONS = ['bin', 'gguf'] as const
export type ModelExtension = (typeof MODEL_EXTENSIONS)[number]

const MODEL_EXTENSION_PATTERN = new RegExp(`\\.(${MODEL_EXTENSIONS.join('|')})$`, 'i')

type DownloadModelResult = { status: 'completed'; path: string } | { status: 'cancelled' }

export function getModelExtension(filename: string): ModelExtension | null {
	const extension = filename.match(MODEL_EXTENSION_PATTERN)?.[1]?.toLowerCase()
	return MODEL_EXTENSIONS.includes(extension as ModelExtension) ? (extension as ModelExtension) : null
}

export function isGgufModel(filename: string) {
	return getModelExtension(filename) === 'gguf'
}

export function isModelPackage(filename: string) {
	return /\.vibe-model$/i.test(filename)
}

export function randomString(length: number, prefix: string, suffix: string) {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = prefix
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result + suffix
}

export async function getFilenameFromUrl(url: string) {
	const urlObj = new URL(url)
	const fileName = urlObj.pathname.split('/').pop() || ''
	return fileName
}

export function getFriendlyModelName(filename: string) {
	const name = filename.replace(MODEL_EXTENSION_PATTERN, '').replace(/^ggml[-_]?/, '')
	if (!name || name === 'model') return 'Custom model'
	return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** A model file on disk, together with the verdict of the backend integrity check. */
export interface InstalledModel extends NamedPath {
	valid: boolean
	/** Why the file was rejected — shown to the user so "corrupt" is not a mystery. */
	reason: string | null
}

interface ModelFileCheck {
	path: string
	valid: boolean
	size: number
	reason: string | null
}

export async function getModelsFolder() {
	return invoke<string>('get_models_folder')
}

/** Legacy weights fail open if the backend is unavailable; packages must pass strict validation. */
export async function checkModelFiles(paths: string[]): Promise<ModelFileCheck[]> {
	if (paths.length === 0) return []
	const unchecked = (path: string): ModelFileCheck => ({
		path,
		valid: !isModelPackage(path),
		size: 0,
		reason: isModelPackage(path) ? 'Model package validation could not be completed.' : null,
	})
	try {
		const checks = await invoke<ModelFileCheck[]>('check_model_files', { paths })
		const byPath = new Map(checks.map((check) => [check.path, check]))
		return paths.map((path) => {
			const check = byPath.get(path)
			if (isModelPackage(path) && typeof check?.valid !== 'boolean') return unchecked(path)
			return check ?? unchecked(path)
		})
	} catch (error) {
		console.error('failed to check model files:', error)
		return paths.map(unchecked)
	}
}

/** Delete leftover `*.part` files — partial downloads cannot be resumed, so they only take space. */
export async function cleanupPartialDownloads(folder?: string): Promise<string[]> {
	try {
		return await invoke<string[]>('cleanup_partial_downloads', { folder: folder ?? (await getModelsFolder()) })
	} catch (error) {
		console.error('failed to clean up partial downloads:', error)
		return []
	}
}

/**
 * Support models that share the models folder — and, for the Silero VAD, even the GGML magic — but
 * are never transcription models. The gates that need them address them by exact path, so leaving
 * them out of this listing does not make them look missing.
 */
const AUXILIARY_MODEL_FILENAMES = [vadModelFilename, diarizeModelFilename, embeddingModelFilename, segmentModelFilename]

export function isAuxiliaryModelFile(filename: string) {
	return AUXILIARY_MODEL_FILENAMES.some((auxiliary) => auxiliary.toLowerCase() === filename.toLowerCase())
}

/** Direct legacy weights and one-level packages only; never expose package components or staging. */
export async function listInstalledModels(folder?: string): Promise<InstalledModel[]> {
	const modelsFolder = folder ?? (await getModelsFolder())
	const files: NamedPath[] = []
	for (const entry of await fsExt.readDir(modelsFolder)) {
		if (entry.isFile && isModelFile(entry.name) && !isAuxiliaryModelFile(entry.name)) {
			files.push({ name: entry.name, path: await pathExt.join(modelsFolder, entry.name) })
		} else if (entry.isDirectory && !entry.isSymlink && !entry.name.startsWith('.')) {
			const directory = await pathExt.join(modelsFolder, entry.name)
			try {
				const children = await fsExt.readDir(directory)
				if (children.some((child) => child.isFile && child.name === 'model.vibe-model')) {
					files.push({ name: entry.name, path: await pathExt.join(directory, 'model.vibe-model') })
				}
			} catch (error) {
				console.error(`failed to inspect model package directory ${directory}:`, error)
			}
		}
	}
	const checks = await checkModelFiles(files.map((file) => file.path))
	const byPath = new Map(checks.map((check) => [check.path, check]))
	return files.map((file) => ({
		...file,
		valid: byPath.get(file.path)?.valid ?? !isModelPackage(file.path),
		reason: byPath.get(file.path)?.reason ?? null,
	}))
}

/**
 * Whether a file the app depends on is usable. Weights are validated against their magic bytes —
 * which now includes the diarization model, a GGUF since it moved off ONNX Runtime. Anything else
 * (the legacy ONNX embedding/segmentation pair, yt-dlp) has no magic, so existence is all we have.
 */
export async function isModelFileUsable(path: string) {
	if (!(await fsExt.exists(path))) return false
	if (!isModelFile(path) && !isModelPackage(path)) return true
	const [check] = await checkModelFiles([path])
	return check?.valid ?? !isModelPackage(path)
}

interface DownloadModelOptions {
	/** Overwrite exactly this file — used to replace a model that failed its integrity check. */
	replacePath?: string
}

export async function downloadModel(source: string | ModelDownload, options: DownloadModelOptions = {}) {
	const { url, ...integrity }: ModelDownload = typeof source === 'string' ? { url: source } : source
	const modelPath = options.replacePath ?? (await resolveDownloadPath(url))
	const result = await invoke<DownloadModelResult>('download_model', { url, path: modelPath, integrity: toIntegrity(integrity) })
	return result.status === 'completed' ? result.path : null
}

function toIntegrity(integrity: ModelIntegrity): ModelIntegrity | undefined {
	return integrity.size === undefined && integrity.sha256 === undefined ? undefined : integrity
}

/**
 * Where a download should land. A name already taken by a healthy model gets a random suffix so the
 * two can coexist, but one taken by a corrupt file is reused: retrying a failed download must
 * replace the broken file instead of leaving it behind next to a second copy.
 */
async function resolveDownloadPath(url: string) {
	let filename = await getFilenameFromUrl(url)
	if (!isModelFile(filename)) {
		filename = 'ggml-model.bin'
	}
	const modelsFolder = await getModelsFolder()
	const modelPath = await pathExt.join(modelsFolder, filename)
	if (!(await fsExt.exists(modelPath)) || !(await isModelFileUsable(modelPath))) {
		return modelPath
	}
	return pathExt.join(modelsFolder, randomString(8, 'ggml-model_', `.${getModelExtension(filename) ?? 'bin'}`))
}

export function isModelFile(filename: string) {
	return getModelExtension(filename) !== null
}

export interface ModelCapabilities {
	engine: 'whisper' | 'nemotron' | 'funasr-nano' | 'sensevoice' | string
	requires_vad: boolean
	languages: string[]
	language_detection: boolean
	streaming: boolean
	translation: boolean
	timestamps: boolean
	text_prompts: boolean
}

export interface ModelMetadata {
	format: string
	capabilities: ModelCapabilities
}

export function isNativeAsr(capabilities: ModelCapabilities | null | undefined) {
	return capabilities?.engine === 'funasr-nano' || capabilities?.engine === 'sensevoice'
}

const WHISPER_OPTIONS = [
	'init_prompt', 'translate', 'n_threads', 'temperature', 'max_text_ctx',
	'word_timestamps', 'max_sentence_len', 'sampling_strategy', 'best_of', 'beam_size',
] as const

/** The subset of transcribe options that only some engines honour. */
type EngineSpecificOptions = Partial<Record<(typeof WHISPER_OPTIONS)[number], unknown>> & { lang?: string }

/**
 * Filter only the outgoing request, never saved preferences. Switching back to Whisper restores
 * its prompt, decoding settings and selected language. Unknown capabilities leave options alone.
 */
export function withoutUnsupportedOptions<T extends EngineSpecificOptions>(options: T, capabilities: ModelCapabilities | null | undefined): T {
	if (!capabilities) return options
	const next = { ...options }
	if (isNativeAsr(capabilities)) {
		for (const key of WHISPER_OPTIONS) delete next[key]
		next.lang = 'auto'
	} else {
		if (!capabilities.text_prompts) delete next.init_prompt
		if (!capabilities.translation) delete next.translate
	}
	return next
}
