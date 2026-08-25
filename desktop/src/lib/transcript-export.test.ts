import { describe, expect, it } from 'vitest'
import { serializeTranscriptExport, type TranscriptExportOptions } from './transcript-export'
import type { Segment } from './transcript'

const segments: Segment[] = [
	{ start: 125, stop: 350, speaker: 0, text: ' Hello <world> & "friends" ' },
	{ start: 360, stop: 725, speaker: 1, text: 'Second --> line' },
]

const options: TranscriptExportOptions = {
	content: 'transcript',
	showTimestamps: true,
	showSpeakers: true,
	speakerLabel: 'Speaker',
	title: 'Interview & notes',
	direction: 'ltr',
}

function serialize(format: Parameters<typeof serializeTranscriptExport>[0], overrides: Partial<TranscriptExportOptions> = {}, summary = 'A short summary.') {
	return serializeTranscriptExport(format, segments, summary, { ...options, ...overrides })
}

describe('serializeTranscriptExport', () => {
	it('serializes plain text with independently controlled metadata', () => {
		expect(serialize('normal')).toBe(
			'00:01.250 --> 00:03.500 · Speaker 1\nHello <world> & "friends"\n\n00:03.600 --> 00:07.250 · Speaker 2\nSecond --> line',
		)
		expect(serialize('normal', { showTimestamps: false })).not.toContain('00:01.250')
		expect(serialize('normal', { showSpeakers: false })).not.toContain('Speaker')
	})

	it('makes transcript, summary, and both explicit', () => {
		expect(serialize('normal', { content: 'summary' })).toBe('A short summary.')
		const both = serialize('normal', { content: 'both' })
		expect(both).toContain('Transcript\n\n00:01.250')
		expect(both).toContain('\n\nSummary\n\nA short summary.')
	})

	it('serializes Markdown with document and section headings', () => {
		const markdown = serialize('md', { content: 'both' })
		expect(markdown).toContain('# Interview & notes')
		expect(markdown).toContain('## Transcript')
		expect(markdown).toContain('**00:01.250 --> 00:03.500 · Speaker 1**')
		expect(markdown).toContain('## Summary')
	})

	it('keeps required SRT timing when display timestamps are disabled', () => {
		const srt = serialize('srt', { showTimestamps: false, showSpeakers: false, content: 'both' })
		expect(srt).toContain('1\n00:00:01,250 --> 00:00:03,500\nHello <world> & "friends"')
		expect(srt).not.toContain('[Speaker')
		expect(srt).toContain('NOTE Summary\nA short summary.')
		expect(srt).toContain('Second -> line')
	})

	it('writes a valid VTT header, timed cues, and summary note', () => {
		const vtt = serialize('vtt', { content: 'both' })
		expect(vtt).toMatch(/^WEBVTT\n\n/)
		expect(vtt).toContain('00:01.250 --> 00:03.500\n[Speaker 1] Hello')
		expect(vtt).toContain('NOTE Summary\nA short summary.')
	})

	it('escapes HTML data and applies direction without mounting DOM', () => {
		const html = serialize('html', { content: 'both', direction: 'rtl', theme: 'dark' }, 'Summary <script>alert(1)</script>')
		expect(html).toContain('<!doctype html>')
		expect(html).toContain('<html dir="rtl">')
		expect(html).toContain('<main class="html printable" dir="rtl">')
		expect(html).toContain('background:#181818')
		expect(html).toContain('\u206600:01.250 --&gt; 00:03.500\u2069')
		expect(html).toContain('<title>Interview &amp; notes</title>')
		expect(html).toContain('Hello &lt;world&gt; &amp; &quot;friends&quot;')
		expect(html).toContain('Summary &lt;script&gt;alert(1)&lt;/script&gt;')
		expect(html).not.toContain('<script>alert(1)</script>')
	})

	it('includes only selected JSON fields and converts timing to seconds', () => {
		const json = JSON.parse(serialize('json', { content: 'both', showTimestamps: true, showSpeakers: false }))
		expect(json).toEqual({
			direction: 'ltr',
			title: 'Interview & notes',
			transcript: [
				{ start: 1.25, stop: 3.5, text: 'Hello <world> & "friends"' },
				{ start: 3.6, stop: 7.25, text: 'Second --> line' },
			],
			summary: 'A short summary.',
		})
		expect(JSON.parse(serialize('json', { content: 'summary' }))).not.toHaveProperty('transcript')
		expect(JSON.parse(serialize('json', { showTimestamps: false }))).not.toHaveProperty('transcript.0.start')
		expect(JSON.parse(serialize('json', { showSpeakers: true }))).toHaveProperty('transcript.0.speaker', 1)
	})

	it('uses a stable CSV schema with optional timing and speaker columns', () => {
		const csv = serialize('csv', { content: 'both' })
		expect(csv.split('\n')[0]).toBe('content,start,end,speaker,text')
		expect(csv).toContain('"transcript","00:00:01.250","00:00:03.500","1","Hello <world> & ""friends"""')
		expect(csv).toContain('"summary","","","","A short summary."')
		const compact = serialize('csv', { showTimestamps: false, showSpeakers: false })
		expect(compact.split('\n')[0]).toBe('content,text')
	})

	it.each(['docx', 'pdf'] as const)('provides an accurate %s text approximation', (format) => {
		const preview = serialize(format, { content: 'both', showSpeakers: false })
		expect(preview).toBe(
			'Interview & notes\n\nTranscript\n\n00:01.250 --> 00:03.500\nHello <world> & "friends"\n\n00:03.600 --> 00:07.250\nSecond --> line\n\nSummary\n\nA short summary.',
		)
	})

	it('handles an unavailable summary deterministically', () => {
		expect(serializeTranscriptExport('normal', segments, undefined, { ...options, content: 'summary' })).toBe('')
		expect(JSON.parse(serializeTranscriptExport('json', segments, undefined, { ...options, content: 'summary' }))).toHaveProperty('summary', '')
	})
})
