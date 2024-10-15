import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import { Segment } from './transcript'
import { formatDuration } from '~/components/HtmlView'

export async function toDocx(title: string, segments: Segment[], direction: 'rtl' | 'ltr') {
	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						textDirection: direction === 'rtl' ? 'lrTb' : 'tbRl',
					},
				},
				children: [
					// Add the title as a centered paragraph
					new Paragraph({
						alignment: AlignmentType.CENTER,
						children: [
							new TextRun({
								text: title,
								color: '1565C0',
								size: 36 * 1.5,
								bold: true,
							}),
						],
					}),
					// Add an empty paragraph for spacing after the title
					new Paragraph({}),
					...segments.map((segment) => {
						const duration = formatDuration(segment.start, segment.stop, direction)
						return new Paragraph({
							alignment: direction === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
							children: [new TextRun({ text: duration, bold: true }), new TextRun({ text: `\n${segment.text}`, break: 1 })],
						})
					}),
				],
			},
		],
	})

	const blob = await Packer.toBlob(doc)
	return blob
}
