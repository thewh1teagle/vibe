import * as pathApi from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import type { Segment } from './transcript'

/**
 * Transcript persistence.
 *
 * The store is *a folder of files*: `Documents/Vibe/<name>-<yyyyMMdd-HHmmss>.vibe.json`.
 * There is no index and no database — listing scans the folder and derives the display name and
 * creation date from the filename, so the list never has to read (and parse) every transcript.
 *
 * Every operation here is best-effort: failures are logged and reported as null/empty so a broken
 * disk, a missing folder or a corrupt file can never break the transcription flow.
 */

export const TRANSCRIPTS_FOLDER = 'Vibe'
export const TRANSCRIPT_EXTENSION = '.vibe.json'

export const TRANSCRIPT_VERSION = 1

export interface TranscriptRecord {
	version: number
	name: string
	sourcePath: string
	/** ISO 8601 */
	createdAt: string
	language?: string
	modelPath?: string | null
	segments: Segment[]
}

export interface TranscriptEntry {
	/** absolute path of the .vibe.json file */
	path: string
	/** display name, derived from the filename */
	name: string
	/** parsed from the filename stamp; falls back to the epoch when unparsable */
	createdAt: Date
}

export interface SaveTranscriptInput {
	name: string
	sourcePath: string
	segments: Segment[]
	language?: string
	modelPath?: string | null
	createdAt?: Date
}

function pad(value: number, length = 2) {
	return String(value).padStart(length, '0')
}

/** `yyyyMMdd-HHmmss` in local time — sortable and readable in the file manager. */
function stamp(date: Date) {
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
	)
}

const stampPattern = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/

function parseStamp(stem: string): { name: string; createdAt: Date } {
	const match = stem.match(stampPattern)
	if (!match) return { name: stem, createdAt: new Date(0) }
	const [, year, month, day, hours, minutes, seconds] = match
	const createdAt = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds))
	return {
		name: stem.slice(0, match.index) || stem,
		createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0) : createdAt,
	}
}

/** Strip the extension and anything a file system would object to. */
function toFileStem(name: string) {
	const withoutExtension = name.replace(/\.[^./\\]+$/, '')
	const cleaned = withoutExtension
		.replace(/[/\\?%*:|"<>]/g, '-')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
	return (cleaned || 'transcript').slice(0, 120)
}

/** Absolute path of the store folder, created on demand. */
export async function transcriptsFolder(): Promise<string> {
	const folder = await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER)
	if (!(await fs.exists(folder))) await fs.mkdir(folder, { recursive: true })
	return folder
}

function isRecord(value: unknown): value is TranscriptRecord {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<TranscriptRecord>
	return typeof candidate.name === 'string' && Array.isArray(candidate.segments)
}

/**
 * Write one transcript into the store.
 * @returns the saved path, or null when saving failed (never throws).
 */
export async function saveTranscript(input: SaveTranscriptInput): Promise<string | null> {
	try {
		const createdAt = input.createdAt ?? new Date()
		const folder = await transcriptsFolder()
		const filename = `${toFileStem(input.name)}-${stamp(createdAt)}${TRANSCRIPT_EXTENSION}`
		const target = await pathApi.join(folder, filename)
		const record: TranscriptRecord = {
			version: TRANSCRIPT_VERSION,
			name: input.name,
			sourcePath: input.sourcePath,
			createdAt: createdAt.toISOString(),
			language: input.language,
			modelPath: input.modelPath ?? null,
			segments: input.segments,
		}
		await fs.writeTextFile(target, JSON.stringify(record, null, '\t'))
		return target
	} catch (error) {
		console.warn('failed to save transcript:', error)
		return null
	}
}

/** Every saved transcript, newest first. Reads file *names* only — never their contents. */
export async function listTranscripts(): Promise<TranscriptEntry[]> {
	try {
		const folder = await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER)
		if (!(await fs.exists(folder))) return []
		const entries = await fs.readDir(folder)
		const found: TranscriptEntry[] = []
		for (const entry of entries) {
			if (entry.isDirectory) continue
			if (!entry.name.endsWith(TRANSCRIPT_EXTENSION)) continue
			const stem = entry.name.slice(0, -TRANSCRIPT_EXTENSION.length)
			const { name, createdAt } = parseStamp(stem)
			found.push({ path: await pathApi.join(folder, entry.name), name, createdAt })
		}
		return found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.path.localeCompare(a.path))
	} catch (error) {
		console.warn('failed to list transcripts:', error)
		return []
	}
}

/** Read and validate one transcript. Corrupt or foreign files resolve to null. */
export async function readTranscript(path: string): Promise<TranscriptRecord | null> {
	try {
		const raw = await fs.readTextFile(path)
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) {
			console.warn('skipping malformed transcript:', path)
			return null
		}
		return {
			version: typeof parsed.version === 'number' ? parsed.version : TRANSCRIPT_VERSION,
			name: parsed.name,
			sourcePath: typeof parsed.sourcePath === 'string' ? parsed.sourcePath : '',
			createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString(),
			language: typeof parsed.language === 'string' ? parsed.language : undefined,
			modelPath: typeof parsed.modelPath === 'string' ? parsed.modelPath : null,
			segments: parsed.segments.filter(
				(segment): segment is Segment => typeof segment === 'object' && segment !== null && typeof (segment as Segment).text === 'string',
			),
		}
	} catch (error) {
		console.warn('failed to read transcript:', path, error)
		return null
	}
}

/**
 * Rewrite the segments of an already stored transcript, keeping every other field untouched.
 * Used by inline editing, which changes text only.
 * @returns whether the file now holds the new segments (never throws).
 */
export async function updateTranscriptSegments(path: string, segments: Segment[]): Promise<boolean> {
	try {
		const record = await readTranscript(path)
		if (!record) return false
		await fs.writeTextFile(path, JSON.stringify({ ...record, segments }, null, '\t'))
		return true
	} catch (error) {
		console.warn('failed to update transcript segments:', path, error)
		return false
	}
}

/**
 * Fired on `window` whenever the store changed (a save or a delete) so open lists can refresh
 * without the writer having to know about them.
 */
export const TRANSCRIPTS_CHANGED_EVENT = 'vibe:transcripts-changed'

export function notifyTranscriptsChanged() {
	window.dispatchEvent(new CustomEvent(TRANSCRIPTS_CHANGED_EVENT))
}

/** Remove one transcript file. Returns whether it is gone. */
export async function deleteTranscript(path: string): Promise<boolean> {
	try {
		await fs.remove(path)
		return true
	} catch (error) {
		console.warn('failed to delete transcript:', path, error)
		return false
	}
}

/**
 * Rename a stored transcript: updates the record's `name` and moves the file to a filename
 * carrying the new name while keeping the original timestamp stamp.
 * @returns the new entry, or null on failure (never throws).
 */
export async function renameTranscript(path: string, newName: string): Promise<TranscriptEntry | null> {
	try {
		const record = await readTranscript(path)
		if (!record) return null
		const stem = toFileStem(newName)
		const filename = path.split(/[/\\]/).pop() ?? path
		const oldStem = filename.slice(0, -TRANSCRIPT_EXTENSION.length)
		const stampMatch = oldStem.match(stampPattern)
		const keptStamp = stampMatch ? oldStem.slice(stampMatch.index) : `-${stamp(new Date())}`
		const folder = path.slice(0, path.length - filename.length - 1) || (await transcriptsFolder())
		const target = await pathApi.join(folder, `${stem}${keptStamp}${TRANSCRIPT_EXTENSION}`)
		if (target === path) return { path, name: stem, createdAt: parseStamp(oldStem).createdAt }
		await fs.writeTextFile(target, JSON.stringify({ ...record, name: stem }, null, '\t'))
		await fs.remove(path)
		return { path: target, name: stem, createdAt: parseStamp(`${stem}${keptStamp}`).createdAt }
	} catch (error) {
		console.warn('failed to rename transcript:', path, error)
		return null
	}
}
