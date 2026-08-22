/**
 * MediaRecorder container negotiation.
 *
 * Safari supports none of the Opus containers — it records `audio/mp4` (AAC).
 * Chrome/Firefox prefer WebM/Opus. So probe in preference order and, if nothing
 * reports support, construct the recorder with no `mimeType` at all and take
 * whatever the browser produces. We never synthesise WAV; the desktop side gets
 * the real `blob.type` and a filename whose extension matches it.
 */

export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'] as const

const EXT_BY_MIME: Array<[RegExp, string]> = [
	[/^audio\/mp4$/, 'm4a'],
	[/^audio\/x-m4a$/, 'm4a'],
	[/^audio\/aac$/, 'aac'],
	[/^audio\/webm$/, 'webm'],
	[/^audio\/ogg$/, 'ogg'],
	[/^audio\/opus$/, 'opus'],
	[/^video\/mp4$/, 'mp4'],
	[/^audio\/mpeg$/, 'mp3'],
	[/^audio\/wav$/, 'wav'],
	[/^audio\/x-wav$/, 'wav'],
]

/** Best supported container, or `null` to let the browser pick its default. */
export function pickMimeType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null
	if (typeof MediaRecorder.isTypeSupported !== 'function') return null
	for (const candidate of MIME_CANDIDATES) {
		try {
			if (MediaRecorder.isTypeSupported(candidate)) return candidate
		} catch {
			/* some engines throw on unknown type strings */
		}
	}
	return null
}

export function extForMime(mime: string): string {
	const base = String(mime || '')
		.split(';')[0]
		.trim()
		.toLowerCase()
	for (const [pattern, ext] of EXT_BY_MIME) if (pattern.test(base)) return ext
	return 'bin'
}

export function filenameFor(mime: string): string {
	return `recording.${extForMime(mime)}`
}

export function canRecord(): boolean {
	return (
		typeof MediaRecorder !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices &&
		typeof navigator.mediaDevices.getUserMedia === 'function'
	)
}

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
