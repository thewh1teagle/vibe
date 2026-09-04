import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import { diarizeModelFilename, embeddingModelFilename, segmentModelFilename, vadModelFilename, type ModelDownload, type ModelIntegrity } from './config'
import { lsFiles } from './fs'
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

/**
 * Size and magic bytes of every given file, checked by the backend. A backend failure fails open:
 * losing the check is better than hiding models the user actually has.
 */
export async function checkModelFiles(paths: string[]): Promise<ModelFileCheck[]> {
	if (paths.length === 0) return []
	try {
		return await invoke<ModelFileCheck[]>('check_model_files', { paths })
	} catch (error) {
		console.error('failed to check model files:', error)
		return paths.map((path) => ({ path, valid: true, size: 0, reason: null }))
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

/** Every transcription model in the folder, with truncated or corrupt ones flagged rather than hidden. */
export async function listInstalledModels(folder?: string): Promise<InstalledModel[]> {
	const modelsFolder = folder ?? (await getModelsFolder())
	const files = (await lsFiles(modelsFolder)).filter((entry) => isModelFile(entry.name) && !isAuxiliaryModelFile(entry.name))
	const checks = await checkModelFiles(files.map((file) => file.path))
	const byPath = new Map(checks.map((check) => [check.path, check]))
	return files.map((file) => ({ ...file, valid: byPath.get(file.path)?.valid ?? true, reason: byPath.get(file.path)?.reason ?? null }))
}

/**
 * Whether a file the app depends on is usable. Weights are validated against their magic bytes —
 * which now includes the diarization model, a GGUF since it moved off ONNX Runtime. Anything else
 * (the legacy ONNX embedding/segmentation pair, yt-dlp) has no magic, so existence is all we have.
 */
export async function isModelFileUsable(path: string) {
	if (!(await fsExt.exists(path))) return false
	if (!isModelFile(path)) return true
	const [check] = await checkModelFiles([path])
	return check?.valid ?? true
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
	engine: 'whisper' | 'nemotron' | string
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

/** The subset of transcribe options that only some engines honour. */
interface EngineSpecificOptions {
	init_prompt?: string
	translate?: boolean
}

/**
 * Drop the Whisper-only options a model cannot use instead of letting server reject the run.
 * A prompt written for Turbo stays saved in settings, so switching to Parakeet or Nemotron
 * and back needs no retyping. Unknown capabilities (no metadata yet) leave the options alone.
 */
export function withoutUnsupportedOptions<T extends EngineSpecificOptions>(options: T, capabilities: ModelCapabilities | null | undefined): T {
	if (!capabilities) return options
	const next = { ...options }
	if (!capabilities.text_prompts) delete next.init_prompt
	if (!capabilities.translation) delete next.translate
	return next
}
