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

export function asText(segments: Segment[], speakerLabel: string = 'Speaker') {
	return segments.reduce((transcript, segment) => {
		const text = segment.text
			.trim()
			.replace(/^[.,!?;:\s]+/, '')
			.trimEnd()
		if (!text) return transcript
		return transcript + `${speakerPrefix(segment, speakerLabel)}${text}\n`
	}, '')
}
