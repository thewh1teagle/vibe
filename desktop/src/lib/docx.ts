import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import { Segment } from './transcript'
import { formatDuration } from '~/components/html-view'

export interface DocxExportOptions {
	content?: 'transcript' | 'summary' | 'both'
	showTimestamps?: boolean
	showSpeakers?: boolean
	summary?: string
	transcriptLabel?: string
	summaryLabel?: string
	theme?: 'dark' | 'light'
}

export async function toDocx(title: string, segments: Segment[], direction: 'rtl' | 'ltr', speakerLabel: string = 'Speaker', options: DocxExportOptions = {}) {
	const isRtl = direction === 'rtl'
	const dark = options.theme === 'dark'
	const foreground = dark ? 'ECECEC' : '1A1C1F'
	const muted = dark ? 'A3A3A3' : '6E6E6E'
	const content = options.content ?? 'transcript'
	const showTimestamps = options.showTimestamps ?? true
	const showSpeakers = options.showSpeakers ?? true
	const includeTranscript = content !== 'summary'
	const includeSummary = content !== 'transcript' && Boolean(options.summary)
	const heading = (text: string) =>
		new Paragraph({
			alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
			bidirectional: isRtl,
			spacing: { before: 240, after: 120 },
			children: [new TextRun({ text, bold: true, size: 28, color: foreground, rightToLeft: isRtl })],
		})
	const segmentParagraphs = segments.map((segment) => {
		const metadata = [
			showTimestamps ? formatDuration(segment.start, segment.stop, direction) : '',
			showSpeakers && segment.speaker != null ? `${speakerLabel} ${segment.speaker + 1}` : '',
		].filter(Boolean)
		return new Paragraph({
			alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
			bidirectional: isRtl,
			children: [
				...(metadata.length > 0 ? [new TextRun({ text: metadata.join('  '), bold: true, color: muted, rightToLeft: isRtl })] : []),
				new TextRun({ text: segment.text.trim(), break: metadata.length > 0 ? 1 : undefined, color: foreground, rightToLeft: isRtl }),
			],
		})
	})
	const doc = new Document({
		background: { color: dark ? '181818' : 'FFFFFF' },
		sections: [
			{
				children: [
					// Add the title as a centered paragraph
					new Paragraph({
						alignment: AlignmentType.CENTER,
						bidirectional: isRtl,
						children: [
							new TextRun({
								text: title,
								color: '1565C0',
								size: 36 * 1.5,
								bold: true,
								rightToLeft: isRtl,
							}),
						],
					}),
					new Paragraph({}),
					...(includeTranscript ? [...(content === 'both' ? [heading(options.transcriptLabel ?? 'Transcript')] : []), ...segmentParagraphs] : []),
					...(includeSummary
						? [
								...(content === 'both' ? [heading(options.summaryLabel ?? 'Summary')] : []),
								new Paragraph({
									alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
									bidirectional: isRtl,
									children: [new TextRun({ text: options.summary?.trim() ?? '', color: foreground, rightToLeft: isRtl })],
								}),
							]
						: []),
				],
			},
		],
	})

	const blob = await Packer.toBlob(doc)
	return blob
}
