export interface Duration {
	secs: number
	nanos: number
}

export interface Transcript {
	processing_time?: Duration
	segments: Segment[]
	word_segments?: Segment[]
}

export interface Segment {
	start: number
	stop: number
	text: string
	speaker?: number
}

/** Display names chosen for diarized speakers, keyed by the segment's zero-based speaker index. */
export type SpeakerNames = Record<number, string>

/** What a speaker is called on screen and in exports: the chosen name, else "Speaker N". */
export function speakerName(speaker: number, label: string, names?: SpeakerNames): string {
	const chosen = names?.[speaker]?.trim()
	return chosen || `${label} ${speaker + 1}`
}

export function formatTimestamp(seconds: number, alwaysIncludeHours: boolean, decimalMarker: string, includeMilliseconds: boolean = true): string {
	if (seconds < 0) {
		throw new Error('Non-negative timestamp expected')
	}

	let milliseconds = seconds * 10

	const hours = Math.floor(milliseconds / 3_600_000)
	milliseconds -= hours * 3_600_000

	const minutes = Math.floor(milliseconds / 60_000)
	milliseconds -= minutes * 60_000

	const formattedSeconds = Math.floor(milliseconds / 1_000)
	milliseconds -= formattedSeconds * 1_000

	const hoursMarker = alwaysIncludeHours || hours !== 0 ? `${String(hours).padStart(2, '0')}:` : ''

	let result = `${hoursMarker}${String(minutes).padStart(2, '0')}:${String(formattedSeconds).padStart(2, '0')}`

	if (includeMilliseconds) {
		result += `${decimalMarker}${String(milliseconds).padStart(3, '0')}`
	}

	return result
}

function speakerPrefix(segment: Segment, label: string, names?: SpeakerNames): string {
	return segment.speaker != null ? `[${speakerName(segment.speaker, label, names)}] ` : ''
}

export function asSrt(segments: Segment[], speakerLabel: string = 'Speaker', speakerNames?: SpeakerNames) {
	return segments.reduce((transcript, segment, i) => {
		return (
			transcript +
			`${i > 0 ? '\n' : ''}${i + 1}\n` +
			`${formatTimestamp(segment.start, true, ',')} --> ${formatTimestamp(segment.stop, true, ',')}\n` +
			`${speakerPrefix(segment, speakerLabel, speakerNames)}${segment.text.trim().replace('-->', '->')}\n`
		)
	}, '')
}

export function asVtt(segments: Segment[], speakerLabel: string = 'Speaker', speakerNames?: SpeakerNames) {
	return segments.reduce((transcript, segment) => {
		return (
			transcript +
			`${formatTimestamp(segment.start, false, '.')} --> ${formatTimestamp(segment.stop, false, '.')}\n` +
			`${speakerPrefix(segment, speakerLabel, speakerNames)}${segment.text.trim().replace('-->', '->')}\n`
		)
	}, '')
}

export function asText(segments: Segment[], speakerLabel: string = 'Speaker', speakerNames?: SpeakerNames) {
	return segments.reduce((transcript, segment) => {
		return transcript + `${speakerPrefix(segment, speakerLabel, speakerNames)}${segment.text.trim()}\n`
	}, '')
}

export function normalizeWhitespace(text: string) {
	return text.replace(/\s+/g, ' ').trim()
}

export function asJson(segments: Segment[]) {
	return JSON.stringify(
		segments.map((s) => ({
			...s,
			start: s.start / 100,
			stop: s.stop / 100,
		})),
		null,
		4,
	)
}

function escapeCsv(value: string) {
	return `"${value.replace(/"/g, '""')}"`
}

export function asCsv(segments: Segment[]) {
	const hasSpeakers = segments.some((s) => s.speaker != null)
	const header = hasSpeakers ? 'start,end,speaker,text' : 'start,end,text'
	const rows = segments.map((segment) => {
		const start = formatTimestamp(segment.start, true, '.')
		const end = formatTimestamp(segment.stop, true, '.')
		const text = segment.text.trim()
		if (hasSpeakers) {
			const speaker = segment.speaker != null ? String(segment.speaker + 1) : ''
			return `${escapeCsv(start)},${escapeCsv(end)},${escapeCsv(speaker)},${escapeCsv(text)}`
		}
		return `${escapeCsv(start)},${escapeCsv(end)},${escapeCsv(text)}`
	})
	return [header, ...rows].join('\n')
}
