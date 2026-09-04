import type { TextFormat } from '~/components/format-select'
import { formatTimestamp, speakerName, type Segment, type SpeakerNames } from '~/lib/transcript'

export type TranscriptExportContent = 'transcript' | 'summary' | 'both'

export interface TranscriptExportOptions {
	content: TranscriptExportContent
	showTimestamps: boolean
	showSpeakers: boolean
	speakerLabel: string
	/** Names the user gave the speakers; unnamed ones fall back to "<speakerLabel> N". */
	speakerNames?: SpeakerNames
	title: string
	direction: 'rtl' | 'ltr'
	theme?: 'dark' | 'light'
}

export function includesTranscript(content: TranscriptExportContent) {
	return content !== 'summary'
}

export function includesSummary(content: TranscriptExportContent) {
	return content !== 'transcript'
}

function timestamp(start: number, stop: number, decimalMarker = '.', alwaysIncludeHours = false) {
	return `${formatTimestamp(start, alwaysIncludeHours, decimalMarker)} --> ${formatTimestamp(stop, alwaysIncludeHours, decimalMarker)}`
}

function speaker(segment: Segment, options: TranscriptExportOptions) {
	return options.showSpeakers && segment.speaker != null ? speakerName(segment.speaker, options.speakerLabel, options.speakerNames) : ''
}

/** The name a user chose for a speaker, when they chose one — machine formats carry it beside the index. */
function chosenSpeakerName(segment: Segment, options: TranscriptExportOptions) {
	const name = segment.speaker != null ? options.speakerNames?.[segment.speaker]?.trim() : undefined
	return name || undefined
}

export function segmentMetadata(segment: Segment, options: TranscriptExportOptions) {
	const time = options.showTimestamps ? timestamp(segment.start, segment.stop) : ''
	const directionalTime = time && options.direction === 'rtl' ? `\u2066${time}\u2069` : time
	return [directionalTime, speaker(segment, options)].filter(Boolean).join(' · ')
}

function sectioned(transcript: string, summary: string, options: TranscriptExportOptions, heading: (value: string) => string) {
	if (options.content === 'transcript') return transcript
	if (options.content === 'summary') return summary
	return `${heading('Transcript')}\n\n${transcript}\n\n${heading('Summary')}\n\n${summary}`
}

function serializeText(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const transcript = segments
		.map((segment) => {
			const metadata = segmentMetadata(segment, options)
			return `${metadata ? `${metadata}\n` : ''}${segment.text.trim()}`
		})
		.join('\n\n')
	return sectioned(transcript, summary, options, (heading) => heading)
}

function serializeMarkdown(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const transcript = segments
		.map((segment) => {
			const metadata = segmentMetadata(segment, options)
			return `${metadata ? `**${metadata}**\n\n` : ''}${segment.text.trim()}`
		})
		.join('\n\n')
	const content = sectioned(transcript, summary, options, (heading) => `## ${heading}`)
	return options.title.trim() ? `# ${options.title.trim()}\n\n${content}` : content
}

function subtitleText(segment: Segment, options: TranscriptExportOptions) {
	const prefix = speaker(segment, options)
	return `${prefix ? `[${prefix}] ` : ''}${segment.text.trim().replace(/-->/g, '->')}`
}

function serializeSrt(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const cues = includesTranscript(options.content)
		? segments.map((segment, index) => `${index + 1}\n${timestamp(segment.start, segment.stop, ',', true)}\n${subtitleText(segment, options)}`).join('\n\n')
		: ''
	const summaryBlock = includesSummary(options.content) ? `NOTE Summary\n${summary}` : ''
	return [cues, summaryBlock].filter(Boolean).join('\n\n')
}

function serializeVtt(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const cues = includesTranscript(options.content)
		? segments.map((segment) => `${timestamp(segment.start, segment.stop)}\n${subtitleText(segment, options)}`).join('\n\n')
		: ''
	const summaryBlock = includesSummary(options.content) ? `NOTE Summary\n${summary}` : ''
	return `WEBVTT\n\n${[cues, summaryBlock].filter(Boolean).join('\n\n')}`
}

function escapeHtml(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function htmlText(value: string) {
	return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

function serializeHtml(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const dark = options.theme === 'dark'
	const palette = dark
		? { background: '#181818', foreground: '#ececec', muted: '#a3a3a3', primary: '#60a5fa', border: '#303030' }
		: { background: '#ffffff', foreground: '#1a1c1f', muted: '#6e6e6e', primary: '#2563eb', border: '#e6e6e6' }
	const transcript = segments
		.map((segment) => {
			const metadata = segmentMetadata(segment, options)
			return `<article class="segment">${metadata ? `<div class="metadata">${escapeHtml(metadata)}</div>` : ''}<p>${htmlText(segment.text.trim())}</p></article>`
		})
		.join('\n')
	const sections: string[] = []
	if (includesTranscript(options.content)) {
		sections.push(`<section class="transcript">${options.content === 'both' ? '<h2>Transcript</h2>' : ''}${transcript}</section>`)
	}
	if (includesSummary(options.content)) {
		sections.push(`<section class="summary">${options.content === 'both' ? '<h2>Summary</h2>' : ''}<p>${htmlText(summary)}</p></section>`)
	}
	const title = options.title.trim()
	return [
		'<!doctype html>',
		`<html dir="${options.direction}">`,
		'<head>',
		'<meta charset="utf-8">',
		`<meta name="color-scheme" content="${dark ? 'dark' : 'light'}">`,
		`<title>${escapeHtml(title)}</title>`,
		`<style>:root{color-scheme:${dark ? 'dark' : 'light'}}html,body{min-height:100%;margin:0;background:${palette.background};color:${palette.foreground}}.html{box-sizing:border-box;min-height:100vh;font-family:Roboto,Arial,sans-serif;max-width:1000px;margin:auto;padding:22px;line-height:1.5;background:${palette.background};color:${palette.foreground}}.html h1{text-align:center;color:${palette.primary}}.html h2{border-bottom:1px solid ${palette.border};padding-bottom:.35rem}.html .segment{margin-top:18px}.html .metadata{font-size:.8rem;font-weight:600;color:${palette.muted}}.html .segment p,.html .summary p{white-space:normal}</style>`,
		'</head>',
		'<body>',
		`<main class="html printable" dir="${options.direction}">`,
		title ? `<h1>${escapeHtml(title)}</h1>` : '',
		...sections,
		'</main>',
		'</body>',
		'</html>',
	]
		.filter(Boolean)
		.join('\n')
}

function serializeJson(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const output: { title?: string; direction: 'rtl' | 'ltr'; transcript?: object[]; summary?: string } = {
		direction: options.direction,
	}
	if (options.title.trim()) output.title = options.title.trim()
	if (includesTranscript(options.content)) {
		output.transcript = segments.map((segment) => {
			const row: { start?: number; stop?: number; speaker?: number; speakerName?: string; text: string } = { text: segment.text.trim() }
			if (options.showTimestamps) {
				row.start = segment.start / 100
				row.stop = segment.stop / 100
			}
			if (options.showSpeakers && segment.speaker != null) {
				row.speaker = segment.speaker + 1
				const name = chosenSpeakerName(segment, options)
				if (name) row.speakerName = name
			}
			return row
		})
	}
	if (includesSummary(options.content)) output.summary = summary
	return JSON.stringify(output, null, 2)
}

function escapeCsv(value: string | number) {
	return `"${String(value).replace(/"/g, '""')}"`
}

function serializeCsv(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const header = ['content', ...(options.showTimestamps ? ['start', 'end'] : []), ...(options.showSpeakers ? ['speaker'] : []), 'text']
	const rows: Array<Array<string | number>> = []
	if (includesTranscript(options.content)) {
		for (const segment of segments) {
			rows.push([
				'transcript',
				...(options.showTimestamps ? [formatTimestamp(segment.start, true, '.'), formatTimestamp(segment.stop, true, '.')] : []),
				...(options.showSpeakers ? [segment.speaker != null ? (chosenSpeakerName(segment, options) ?? segment.speaker + 1) : ''] : []),
				segment.text.trim(),
			])
		}
	}
	if (includesSummary(options.content)) {
		rows.push(['summary', ...(options.showTimestamps ? ['', ''] : []), ...(options.showSpeakers ? [''] : []), summary])
	}
	return [header.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n')
}

function serializeDocumentPreview(segments: Segment[], summary: string, options: TranscriptExportOptions) {
	const content = serializeText(segments, summary, options)
	return [options.title.trim(), content].filter(Boolean).join('\n\n')
}

export function serializeTranscriptExport(format: TextFormat, segments: Segment[], summary: string | undefined, options: TranscriptExportOptions): string {
	const normalizedSummary = summary?.trim() ?? ''
	switch (format) {
		case 'md':
			return serializeMarkdown(segments, normalizedSummary, options)
		case 'srt':
			return serializeSrt(segments, normalizedSummary, options)
		case 'vtt':
			return serializeVtt(segments, normalizedSummary, options)
		case 'html':
			return serializeHtml(segments, normalizedSummary, options)
		case 'json':
			return serializeJson(segments, normalizedSummary, options)
		case 'csv':
			return serializeCsv(segments, normalizedSummary, options)
		case 'docx':
		case 'pdf':
			return serializeDocumentPreview(segments, normalizedSummary, options)
		case 'normal':
			return serializeText(segments, normalizedSummary, options)
	}
}
