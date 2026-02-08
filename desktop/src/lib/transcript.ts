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

function speakerPrefix(segment: Segment, label: string): string {
	return segment.speaker != null ? `[${label} ${segment.speaker + 1}] ` : ''
}

export function asSrt(segments: Segment[], speakerLabel: string = 'Speaker') {
	return segments.reduce((transcript, segment, i) => {
		return (
			transcript +
			`${i > 0 ? '\n' : ''}${i + 1}\n` +
			`${formatTimestamp(segment.start, true, ',')} --> ${formatTimestamp(segment.stop, true, ',')}\n` +
			`${speakerPrefix(segment, speakerLabel)}${segment.text.trim().replace('-->', '->')}\n`
		)
	}, '')
}

export function asVtt(segments: Segment[], speakerLabel: string = 'Speaker') {
	return segments.reduce((transcript, segment) => {
		return (
			transcript +
			`${formatTimestamp(segment.start, false, '.')} --> ${formatTimestamp(segment.stop, false, '.')}\n` +
			`${speakerPrefix(segment, speakerLabel)}${segment.text.trim().replace('-->', '->')}\n`
		)
	}, '')
}

export function asText(segments: Segment[], speakerLabel: string = 'Speaker') {
	return segments.reduce((transcript, segment) => {
		return transcript + `${speakerPrefix(segment, speakerLabel)}${segment.text.trim()}\n`
	}, '')
}

export function asJson(segments: Segment[]) {
	return JSON.stringify(segments, null, 4)
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
