import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { formatDuration } from '~/components/html-view'
import { speakerName, type Segment, type SpeakerNames } from './transcript'

export interface DocxExportOptions {
	content?: 'transcript' | 'summary' | 'both'
	showTimestamps?: boolean
	showSpeakers?: boolean
	speakerNames?: SpeakerNames
	summary?: string
	transcriptLabel?: string
	summaryLabel?: string
}

/**
 * Word documents get edited, printed and mailed on, so this one is set for paper: an ordinary
 * light page whatever the app's theme is, and a font that exists on every machine that will open
 * it — including for the Hebrew and Arabic a transcript may carry.
 */
const FONT = 'Arial'

/** Sizes are half-points, the unit Word stores. */
const TITLE_SIZE = 44
const HEADING_SIZE = 26
const BODY_SIZE = 22
const METADATA_SIZE = 18

const INK = '1A1C1F'
const MUTED = '6E6E6E'
const ACCENT = '1D4ED8'

/** Twips: 20 per point, so a line of 1.15 at 11pt is 276. */
const LINE = 276
const PARAGRAPH_GAP = 200
const SECTION_GAP = 360

export async function toDocx(title: string, segments: Segment[], direction: 'rtl' | 'ltr', speakerLabel: string = 'Speaker', options: DocxExportOptions = {}) {
	const isRtl = direction === 'rtl'
	const alignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT
	const content = options.content ?? 'transcript'
	const showTimestamps = options.showTimestamps ?? true
	const showSpeakers = options.showSpeakers ?? true
	const includeTranscript = content !== 'summary'
	const includeSummary = content !== 'transcript' && Boolean(options.summary?.trim())

	const body = (text: string) =>
		new Paragraph({
			alignment,
			bidirectional: isRtl,
			spacing: { line: LINE, after: PARAGRAPH_GAP },
			children: [new TextRun({ text, size: BODY_SIZE, color: INK, rightToLeft: isRtl })],
		})

	const heading = (text: string) =>
		new Paragraph({
			heading: HeadingLevel.HEADING_1,
			alignment,
			bidirectional: isRtl,
			spacing: { before: SECTION_GAP, after: 120 },
			children: [new TextRun({ text, bold: true, size: HEADING_SIZE, color: INK, rightToLeft: isRtl })],
		})

	const paragraphs: Paragraph[] = []
	for (const segment of segments) {
		const text = segment.text.trim()
		if (!text) continue
		const metadata = [
			// Always the left-to-right form: the right-to-left embedding the view uses would turn
			// "00:00 --> 00:07" into "00:07 <-- 00:00" once Word resolves the line.
			showTimestamps ? formatDuration(segment.start, segment.stop, 'ltr') : '',
			showSpeakers && segment.speaker != null ? speakerName(segment.speaker, speakerLabel, options.speakerNames) : '',
		]
			.filter(Boolean)
			.join('   ')
		if (metadata) {
			paragraphs.push(
				new Paragraph({
					// Timestamps and speaker numbers read left to right whatever the transcript does;
					// only where the line sits on the page follows the text direction.
					alignment,
					bidirectional: false,
					// The label belongs to the line under it; Word keeps the pair on one page.
					keepNext: true,
					spacing: { before: PARAGRAPH_GAP, after: 40 },
					children: [new TextRun({ text: metadata, bold: true, size: METADATA_SIZE, color: MUTED })],
				}),
			)
		}
		paragraphs.push(body(text))
	}

	const doc = new Document({
		title,
		description: 'Transcript exported from Vibe',
		styles: {
			// Set on the document's default run so every paragraph, and anything the reader types
			// afterwards, inherits the same face rather than Word's own default.
			default: {
				document: {
					run: { font: { ascii: FONT, hAnsi: FONT, cs: FONT }, size: BODY_SIZE, color: INK },
					paragraph: { spacing: { line: LINE } },
				},
			},
		},
		sections: [
			{
				children: [
					new Paragraph({
						alignment: AlignmentType.CENTER,
						bidirectional: isRtl,
						spacing: { after: SECTION_GAP },
						children: [new TextRun({ text: title, bold: true, size: TITLE_SIZE, color: ACCENT, rightToLeft: isRtl })],
					}),
					...(includeTranscript ? [...(content === 'both' ? [heading(options.transcriptLabel ?? 'Transcript')] : []), ...paragraphs] : []),
					...(includeSummary
						? [
								...(content === 'both' ? [heading(options.summaryLabel ?? 'Summary')] : []),
								...(options.summary ?? '')
									.split(/\n{2,}/)
									.map((paragraph) => paragraph.trim())
									.filter(Boolean)
									.map(body),
							]
						: []),
				],
			},
		],
	})

	return Packer.toBlob(doc)
}
