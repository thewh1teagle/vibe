import * as pathApi from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import type { Segment } from './transcript'

/**
 * Transcript persistence.
 *
 * The store is *a folder of project folders*: `Documents/Vibe/<name>-<yyyyMMdd-HHmmss>/` holding
 * `transcript.vibe.json` next to a copy of the media it was transcribed from (`audio.<ext>`), so a
 * saved transcript stays playable even after the original file moves or is deleted.
 *
 * There is no index and no database — listing scans the store and derives the display name and
 * creation date from the folder name, so the list never has to read (and parse) every transcript.
 * Legacy flat saves (`Documents/Vibe/<name>-<stamp>.vibe.json`) are still listed, read, renamed and
 * deleted in place; only new saves use project folders.
 *
 * Every operation here is best-effort: failures are logged and reported as null/empty so a broken
 * disk, a missing folder or a corrupt file can never break the transcription flow.
 */

export const TRANSCRIPTS_FOLDER = 'Vibe'
export const TRANSCRIPT_EXTENSION = '.vibe.json'
/** Name of the record inside a project folder. */
export const TRANSCRIPT_FILENAME = `transcript${TRANSCRIPT_EXTENSION}`

export const TRANSCRIPT_VERSION = 1

export interface TranscriptRecord {
	version: number
	name: string
	sourcePath: string
	/** ISO 8601 */
	createdAt: string
	language?: string
	modelPath?: string | null
	/** Filename of the media copy inside the project folder, relative to it (e.g. `audio.mp3`). */
	audioFile?: string
	segments: Segment[]
	/** Last AI summary of this transcript, when one was made. */
	summary?: string
}

export interface TranscriptEntry {
	/** absolute path of the .vibe.json file (inside its project folder, for non-legacy saves) */
	path: string
	/** display name, derived from the filename */
	name: string
	/** parsed from the filename stamp; falls back to the epoch when unparsable */
	createdAt: Date
	/** Updated stable media path when returned by renameTranscript. */
	mediaPath?: string
}

export interface SaveTranscriptInput {
	name: string
	sourcePath: string
	/** Custom root for project folders; null/undefined uses Documents/Vibe. */
	projectsPath?: string | null
	/** Vibe-created media is removed only after its project copy and metadata are durable. */
	moveSourceMedia?: boolean
	segments: Segment[]
	language?: string
	modelPath?: string | null
	createdAt?: Date
}

export interface SaveTranscriptResult {
	recordPath: string
	/** Stable playback path: the project media copy when one was made, otherwise the source. */
	mediaPath: string
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

/** Last path segment, for both posix and windows separators. */
function basename(path: string) {
	return path.split(/[/\\]/).pop() ?? path
}

/** Containing folder of a path, or `''` when there is none. */
function parentOf(path: string) {
	const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
	return index > 0 ? path.slice(0, index) : ''
}

/** Lowercase-free extension of a filename, without the dot; `''` when it has none. */
function extensionOf(path: string) {
	const name = basename(path)
	const dot = name.lastIndexOf('.')
	if (dot <= 0) return ''
	const extension = name.slice(dot + 1)
	return /^[A-Za-z0-9]{1,10}$/.test(extension) ? extension : ''
}

/** A project save is a `transcript.vibe.json` inside its own folder; anything else is legacy flat. */
function isProjectRecordPath(path: string) {
	return basename(path) === TRANSCRIPT_FILENAME
}

/** Absolute path of the store folder, created on demand. */
export async function transcriptsFolder(projectsPath?: string | null): Promise<string> {
	const folder = projectsPath || (await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER))
	if (!(await fs.exists(folder))) await fs.mkdir(folder, { recursive: true })
	return folder
}

function isRecord(value: unknown): value is TranscriptRecord {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<TranscriptRecord>
	return typeof candidate.name === 'string' && Array.isArray(candidate.segments)
}

function serialize(record: TranscriptRecord) {
	return JSON.stringify(record, null, '\t')
}

let temporaryFileCounter = 0

/** Publish a complete JSON record without exposing a partially written target. */
async function writeRecordAtomic(target: string, record: TranscriptRecord) {
	temporaryFileCounter += 1
	const temporary = `${target}.tmp-${Date.now()}-${temporaryFileCounter}`
	const backup = `${target}.bak-${Date.now()}-${temporaryFileCounter}`
	await fs.writeTextFile(temporary, serialize(record))
	try {
		try {
			await fs.rename(temporary, target)
			return
		} catch (replaceError) {
			if (!(await fs.exists(target))) throw replaceError
		}

		// Some platforms do not replace an existing file with rename. Keep a rollback copy while
		// swapping it, so a failed second rename never destroys the last durable record.
		await fs.rename(target, backup)
		try {
			await fs.rename(temporary, target)
		} catch (error) {
			try {
				await fs.rename(backup, target)
			} catch (rollbackError) {
				console.error('failed to restore transcript metadata after write failure:', target, rollbackError)
			}
			throw error
		}
		try {
			await fs.remove(backup)
		} catch (error) {
			console.warn('failed to remove transcript metadata backup:', backup, error)
		}
	} finally {
		try {
			if (await fs.exists(temporary)) await fs.remove(temporary)
		} catch {
			/* best-effort temporary cleanup */
		}
	}
}

async function removeFolderBestEffort(folder: string) {
	try {
		await fs.remove(folder, { recursive: true })
	} catch (error) {
		console.warn('failed to clean incomplete transcript project:', folder, error)
	}
}

/** mkdir itself is the reservation: concurrent saves cannot both claim the same candidate. */
async function reserveProjectFolder(root: string, name: string, createdAt: Date) {
	const stem = toFileStem(name)
	const suffix = stamp(createdAt)
	for (let attempt = 1; ; attempt += 1) {
		const folderName = attempt === 1 ? `${stem}-${suffix}` : `${stem}-${attempt}-${suffix}`
		const candidate = await pathApi.join(root, folderName)
		try {
			await fs.mkdir(candidate)
			return candidate
		} catch (error) {
			if (await fs.exists(candidate)) continue
			throw error
		}
	}
}

/**
 * Store the transcribed media next to its record so the project folder stays self-contained.
 * Every source is copied first. Vibe-created staging media is removed only after final metadata is
 * durable; imported media always remains user-owned.
 */
async function copySourceMedia(projectFolder: string, sourcePath: string): Promise<{ audioFile: string; path: string } | undefined> {
	const extension = extensionOf(sourcePath)
	if (!sourcePath || !extension) return undefined
	const audioFile = `audio.${extension}`
	const target = await pathApi.join(projectFolder, audioFile)
	await fs.copyFile(sourcePath, target)
	return { audioFile, path: target }
}

/**
 * Write one transcript into the store as a project folder holding the record and a copy of its
 * media.
 * @returns durable record/playback paths, or null when saving failed (never throws).
 */

export async function saveTranscript(input: SaveTranscriptInput): Promise<SaveTranscriptResult | null> {
	let projectFolder: string | null = null
	try {
		const createdAt = input.createdAt ?? new Date()
		const folder = await transcriptsFolder(input.projectsPath)
		projectFolder = await reserveProjectFolder(folder, input.name, createdAt)
		const target = await pathApi.join(projectFolder, TRANSCRIPT_FILENAME)
		const baseRecord: TranscriptRecord = {
			version: TRANSCRIPT_VERSION,
			name: input.name,
			sourcePath: input.sourcePath,
			createdAt: createdAt.toISOString(),
			language: input.language,
			modelPath: input.modelPath ?? null,
			segments: input.segments,
		}

		let media: { audioFile: string; path: string } | undefined
		try {
			media = await copySourceMedia(projectFolder, input.sourcePath)
		} catch (error) {
			if (input.moveSourceMedia) throw error
			console.warn('failed to copy imported media; saving its external source path:', input.sourcePath, error)
		}
		if (input.moveSourceMedia && !media) throw new Error(`Vibe-created media has no usable extension: ${input.sourcePath}`)

		const record: TranscriptRecord = {
			...baseRecord,
			...(media ? { audioFile: media.audioFile } : {}),
			...(input.moveSourceMedia && media ? { sourcePath: media.path } : {}),
		}
		await writeRecordAtomic(target, record)

		if (input.moveSourceMedia) {
			try {
				await fs.remove(input.sourcePath)
			} catch (error) {
				// The final project is complete; leaving a staged duplicate is safer than hiding it.
				console.warn('failed to remove staged media after publishing its project:', input.sourcePath, error)
			}
		}
		return { recordPath: target, mediaPath: media?.path ?? input.sourcePath }
	} catch (error) {
		console.warn('failed to save transcript:', error)
		if (projectFolder) await removeFolderBestEffort(projectFolder)
		return null
	}
}

/**
 * Every saved transcript, newest first: project folders plus legacy flat files. Reads folder and
 * file *names* only — never the records themselves.
 */
export async function listTranscripts(projectsPath?: string | null): Promise<TranscriptEntry[]> {
	try {
		const folder = projectsPath || (await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER))
		if (!(await fs.exists(folder))) return []
		const entries = await fs.readDir(folder)
		const found: TranscriptEntry[] = []
		for (const entry of entries) {
			if (entry.isDirectory) {
				const record = await pathApi.join(folder, entry.name, TRANSCRIPT_FILENAME)
				if (!(await fs.exists(record))) continue
				const { name, createdAt } = parseStamp(entry.name)
				found.push({ path: record, name, createdAt })
				continue
			}
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
			audioFile: typeof parsed.audioFile === 'string' && parsed.audioFile ? basename(parsed.audioFile) : undefined,
			segments: parsed.segments.filter(
				(segment): segment is Segment => typeof segment === 'object' && segment !== null && typeof (segment as Segment).text === 'string',
			),
			summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
		}
	} catch (error) {
		console.warn('failed to read transcript:', path, error)
		return null
	}
}

/**
 * Absolute path of the media copy stored beside a record, when the project folder still has one.
 * Legacy flat saves (and records whose copy was deleted) resolve to null — the caller falls back to
 * `record.sourcePath`.
 */
export async function resolveProjectAudio(jsonPath: string, record: TranscriptRecord): Promise<string | null> {
	try {
		if (!record.audioFile) return null
		const audioPath = await pathApi.join(await pathApi.dirname(jsonPath), record.audioFile)
		return (await fs.exists(audioPath)) ? audioPath : null
	} catch (error) {
		console.warn('failed to resolve the transcript media copy:', jsonPath, error)
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
		await writeRecordAtomic(path, { ...record, segments })
		return true
	} catch (error) {
		console.warn('failed to update transcript segments:', path, error)
		return false
	}
}

/** Store the AI summary alongside an already saved transcript. @returns whether it was written. */
export async function updateTranscriptSummary(path: string, summary: string): Promise<boolean> {
	try {
		const record = await readTranscript(path)
		if (!record) return false
		await writeRecordAtomic(path, { ...record, summary })
		return true
	} catch (error) {
		console.warn('failed to update transcript summary:', path, error)
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

/**
 * Remove one transcript: the whole project folder (media copy included) for project saves, the
 * single file for legacy ones. Returns whether it is gone.
 */
export async function deleteTranscript(path: string): Promise<boolean> {
	try {
		if (isProjectRecordPath(path)) {
			await fs.remove(await pathApi.dirname(path), { recursive: true })
			return true
		}
		await fs.remove(path)
		return true
	} catch (error) {
		console.warn('failed to delete transcript:', path, error)
		return false
	}
}

/**
 * Remove every saved transcript in the projects folder. The folder itself stays — only what Vibe
 * put there goes, so anything else the user keeps alongside it survives.
 * @returns how many were deleted and how many resisted.
 */
export async function deleteAllTranscripts(projectsPath?: string | null): Promise<{ deleted: number; failed: number }> {
	const entries = await listTranscripts(projectsPath)
	let deleted = 0
	for (const entry of entries) {
		if (await deleteTranscript(entry.path)) deleted++
	}
	return { deleted, failed: entries.length - deleted }
}

/** The stamp suffix of a folder/file stem, or a fresh one when the old name carries none. */
function keptStampOf(stem: string) {
	const match = stem.match(stampPattern)
	return match ? stem.slice(match.index) : `-${stamp(new Date())}`
}

/**
 * Rename a stored transcript: updates the record's `name` and moves the project folder (legacy: the
 * file) to one carrying the new name while keeping the original timestamp stamp.
 * @returns the new entry, or null on failure (never throws).
 */
export async function renameTranscript(path: string, newName: string): Promise<TranscriptEntry | null> {
	try {
		const record = await readTranscript(path)
		if (!record) return null
		const stem = toFileStem(newName)

		if (isProjectRecordPath(path)) {
			const projectFolder = await pathApi.dirname(path)
			const oldFolderName = basename(projectFolder)
			const keptStamp = keptStampOf(oldFolderName)
			const root = parentOf(projectFolder) || (await transcriptsFolder())
			let renamedFolder = projectFolder
			let folderName = oldFolderName

			if (`${stem}${keptStamp}` !== oldFolderName) {
				for (let attempt = 1; ; attempt += 1) {
					folderName = `${stem}${attempt === 1 ? '' : `-${attempt}`}${keptStamp}`
					const candidate = await pathApi.join(root, folderName)
					if (await fs.exists(candidate)) continue
					try {
						await fs.rename(projectFolder, candidate)
						renamedFolder = candidate
						break
					} catch (error) {
						if (await fs.exists(candidate)) continue
						throw error
					}
				}
			}

			const target = await pathApi.join(renamedFolder, TRANSCRIPT_FILENAME)
			let sourcePath = record.sourcePath
			if (record.audioFile) {
				const oldAudioPath = await pathApi.join(projectFolder, record.audioFile)
				if (record.sourcePath === oldAudioPath) sourcePath = await pathApi.join(renamedFolder, record.audioFile)
			}
			try {
				await writeRecordAtomic(target, { ...record, name: stem, sourcePath })
			} catch (error) {
				if (renamedFolder !== projectFolder) {
					try {
						await fs.rename(renamedFolder, projectFolder)
					} catch (rollbackError) {
						console.error('failed to roll back transcript project rename:', renamedFolder, rollbackError)
					}
				}
				throw error
			}
			return {
				path: target,
				name: stem,
				createdAt: parseStamp(folderName).createdAt,
				mediaPath: record.audioFile ? await pathApi.join(renamedFolder, record.audioFile) : record.sourcePath,
			}
		}

		const filename = basename(path)
		const oldStem = filename.slice(0, -TRANSCRIPT_EXTENSION.length)
		const keptStamp = keptStampOf(oldStem)
		const folder = parentOf(path) || (await transcriptsFolder())
		let target = path
		if (`${stem}${keptStamp}${TRANSCRIPT_EXTENSION}` !== filename) {
			for (let attempt = 1; ; attempt += 1) {
				const candidate = await pathApi.join(folder, `${stem}${attempt === 1 ? '' : `-${attempt}`}${keptStamp}${TRANSCRIPT_EXTENSION}`)
				if (await fs.exists(candidate)) continue
				target = candidate
				break
			}
		}
		await writeRecordAtomic(target, { ...record, name: stem })
		if (target === path) return { path, name: stem, createdAt: parseStamp(oldStem).createdAt, mediaPath: record.sourcePath }
		await fs.remove(path)
		return { path: target, name: stem, createdAt: parseStamp(target.slice(0, -TRANSCRIPT_EXTENSION.length)).createdAt, mediaPath: record.sourcePath }
	} catch (error) {
		console.warn('failed to rename transcript:', path, error)
		return null
	}
}
