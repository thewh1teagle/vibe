export interface Transcript {
	segments: Segment[]
}

export interface Segment {
	start: number
	stop: number
	text: string
	speaker?: number
}

function speakerPrefix(segment: Segment, label: string): string {
	return segment.speaker != null ? `[${label} ${segment.speaker + 1}] ` : ''
}

export function asText(segments: Segment[], speakerLabel: string = 'Speaker', raw: boolean = false) {
	const separator = raw ? ' ' : '\n'
	return segments.reduce((transcript, segment) => {
		const text = segment.text
			.trim()
			.replace(/^[.,!?;:\s]+/, '')
			.trimEnd()
		if (!text) return transcript
		if (transcript && raw) {
			return transcript + `${speakerPrefix(segment, speakerLabel)}${text}`
		}
		return transcript + `${speakerPrefix(segment, speakerLabel)}${text}${separator}`
	}, '')
}
