import { createElement } from 'react'
import type { Segment } from '~/lib/transcript'
import type { TranscriptExportOptions } from '~/lib/transcript-export'
import boldUrl from '~/assets/fonts/Rubik-Bold.ttf?url'
import regularUrl from '~/assets/fonts/Rubik-Regular.ttf?url'

export interface TranscriptPdfLabels {
	transcript: string
	summary: string
}

/**
 * Build the transcript as a real PDF: text stays selectable, right-to-left runs are reordered by
 * the Unicode bidi algorithm, and pages break on their own.
 *
 * The renderer and the embedded font weigh about a megabyte between them, so both the library and
 * the document that uses it are imported on the first export rather than at startup.
 */
export async function transcriptToPdf(segments: Segment[], summary: string, options: TranscriptExportOptions, labels: TranscriptPdfLabels) {
	const [{ Font, pdf }, { PDF_FONT, TranscriptDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./transcript-document')])
	// Rubik carries Latin, Hebrew and Cyrillic in one family, so a mixed transcript needs no font
	// switching. Registering again is harmless; react-pdf keeps the last source for each weight.
	Font.register({
		family: PDF_FONT,
		fonts: [
			{ src: regularUrl, fontWeight: 400 },
			{ src: boldUrl, fontWeight: 700 },
		],
	})
	// `pdf()` is typed for a <Document> element; ours renders one, which the types cannot see.
	const document = createElement(TranscriptDocument, { segments, summary, options, labels }) as Parameters<typeof pdf>[0]
	const blob = await pdf(document).toBlob()
	return new Uint8Array(await blob.arrayBuffer())
}
