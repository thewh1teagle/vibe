import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import { Segment } from './transcript'
import { formatDuration } from '~/components/HtmlView'

export async function toDocx(title: string, segments: Segment[], direction: 'rtl' | 'ltr') {
	const isRtl = direction === 'rtl'
	const doc = new Document({
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
					// Add an empty paragraph for spacing after the title
					new Paragraph({}),
					...segments.map((segment) => {
						const duration = formatDuration(segment.start, segment.stop, direction)
						return new Paragraph({
							alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
							bidirectional: isRtl,
							children: [
								new TextRun({ text: duration, bold: true, rightToLeft: isRtl }),
								new TextRun({ text: `\n${segment.text}`, break: 1, rightToLeft: isRtl }),
							],
						})
					}),
				],
			},
		],
	})

	const blob = await Packer.toBlob(doc)
	return blob
}
