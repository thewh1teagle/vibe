import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Durable outbox for recordings.
 *
 * A recording exists nowhere else until the desktop accepts it: the phone is
 * the only copy. So audio is written to IndexedDB the moment it is captured —
 * before the first send is even attempted — and removed only when the desktop
 * confirms a terminal `done`. A crash, a closed tab, or a desktop that is
 * asleep therefore costs nothing but time.
 *
 * Audio is stored as an `ArrayBuffer`, not a `Blob`. WebKit has a long history
 * of bugs storing Blobs in IndexedDB (entries that read back empty or with a
 * lost type, and blobs backed by files that vanish), and an ArrayBuffer is a
 * plain structured-cloneable value with none of that baggage. The `Blob` is
 * reconstructed on read from the stored `mime`.
 */

export interface OutboxEntry {
	id: string
	createdAt: number
	filename: string
	mime: string
	/** Whisper language code, or null for auto-detect. */
	lang: string | null
	size: number
	audio: ArrayBuffer
	/** Bumped each time a send is attempted, for display only. */
	attempts: number
	lastError?: string
}

/** Metadata without the payload — what the UI lists. */
export type OutboxSummary = Omit<OutboxEntry, 'audio'>

interface HandoffDB extends DBSchema {
	recordings: {
		key: string
		value: OutboxEntry
		indexes: { createdAt: number }
	}
}

const DB_NAME = 'vibe-handoff'
const DB_VERSION = 1
const STORE = 'recordings'

/**
 * Caps. Audio is large and the browser's quota is not ours to fill. When the
 * outbox is full we refuse the *new* recording rather than evicting an old one:
 * the new audio is still in memory and the user can act on the message, whereas
 * silently deleting an older unsent recording destroys the only copy of
 * something they already believed was safe.
 */
export const MAX_ENTRIES = 10
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024

export class OutboxFullError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'OutboxFullError'
	}
}

let dbPromise: Promise<IDBPDatabase<HandoffDB>> | null = null

function getDB(): Promise<IDBPDatabase<HandoffDB>> {
	if (!dbPromise) {
		dbPromise = openDB<HandoffDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore(STORE, { keyPath: 'id' })
				store.createIndex('createdAt', 'createdAt')
			},
		}).catch((err) => {
			dbPromise = null
			throw err
		})
	}
	return dbPromise
}

/**
 * Ask the browser to keep our storage. This matters far more now than it did
 * for the pairing alone: eviction would destroy queued audio.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (!navigator.storage?.persist || !navigator.storage.persisted) return false
		if (await navigator.storage.persisted()) return true
		return await navigator.storage.persist()
	} catch {
		return false
	}
}

export async function isStoragePersisted(): Promise<boolean> {
	try {
		return (await navigator.storage?.persisted?.()) ?? false
	} catch {
		return false
	}
}

/** Oldest first — the order they are retried in. */
export async function listOutbox(): Promise<OutboxSummary[]> {
	const db = await getDB()
	const all = await db.getAllFromIndex(STORE, 'createdAt')
	return all.map(({ audio: _audio, ...rest }) => rest)
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
	const db = await getDB()
	return db.get(STORE, id)
}

export async function deleteEntry(id: string): Promise<void> {
	const db = await getDB()
	await db.delete(STORE, id)
}

export async function outboxCount(): Promise<number> {
	const db = await getDB()
	return db.count(STORE)
}

/**
 * Persist a freshly captured recording. Throws `OutboxFullError` when a cap
 * would be exceeded and on `QuotaExceededError` — never resolves silently
 * without having written, because the caller's blob is the only other copy.
 */
export async function addRecording(input: {
	blob: Blob
	filename: string
	mime: string
	lang: string | null
}): Promise<OutboxSummary> {
	// Persistence is requested before the first write, not after, so the very
	// first queued recording is already covered.
	await requestPersistentStorage()

	const db = await getDB()
	const existing = await db.getAll(STORE)
	const totalBytes = existing.reduce((sum, entry) => sum + entry.size, 0)

	if (existing.length >= MAX_ENTRIES) {
		throw new OutboxFullError(
			`The outbox already holds ${existing.length} unsent recordings. Send or delete one before recording again.`
		)
	}
	if (totalBytes + input.blob.size > MAX_TOTAL_BYTES) {
		throw new OutboxFullError('The unsent recordings would exceed the storage limit. Send or delete one before recording again.')
	}

	const entry: OutboxEntry = {
		id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
		createdAt: Date.now(),
		filename: input.filename,
		mime: input.mime,
		lang: input.lang,
		size: input.blob.size,
		audio: await input.blob.arrayBuffer(),
		attempts: 0,
	}

	try {
		await db.put(STORE, entry)
	} catch (err) {
		const name = err instanceof Error ? err.name : ''
		if (name === 'QuotaExceededError') {
			throw new OutboxFullError('There is no room left on this device to save the recording. Free up space or send a queued one first.')
		}
		throw err
	}

	const { audio: _audio, ...summary } = entry
	return summary
}

/** Record an attempt against an entry, for display in the queue. */
export async function markAttempt(id: string, error?: string): Promise<void> {
	const db = await getDB()
	const entry = await db.get(STORE, id)
	if (!entry) return
	entry.attempts += 1
	if (error) entry.lastError = error
	await db.put(STORE, entry)
}

/** Reconstruct the Blob for sending. */
export function blobFor(entry: OutboxEntry): Blob {
	return new Blob([entry.audio], { type: entry.mime })
}
