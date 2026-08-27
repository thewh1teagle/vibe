import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Segment } from '~/lib/transcript'
import { includesSummary, includesTranscript, segmentMetadata, type TranscriptExportOptions } from '~/lib/transcript-export'

/** Registered by `registerPdfFonts` in the app, and from disk in the layout tests. */
export const PDF_FONT = 'Rubik'

/** The same palettes the HTML export uses, so the file matches the preview beside it. */
const PALETTES = {
	dark: { background: '#181818', ink: '#ececec', muted: '#a3a3a3', accent: '#60a5fa' },
	light: { background: '#ffffff', ink: '#1a1c1f', muted: '#6e6e6e', accent: '#2563eb' },
} as const

type Palette = (typeof PALETTES)[keyof typeof PALETTES]

function sheet(palette: Palette, direction: 'rtl' | 'ltr') {
	const align = direction === 'rtl' ? ('right' as const) : ('left' as const)
	return StyleSheet.create({
		page: { paddingVertical: 52, paddingHorizontal: 52, backgroundColor: palette.background, fontFamily: PDF_FONT },
		title: { fontSize: 20, fontWeight: 700, color: palette.accent, textAlign: 'center', marginBottom: 10 },
		heading: { fontSize: 13, fontWeight: 700, color: palette.ink, textAlign: align, direction, marginTop: 18, marginBottom: 2 },
		block: { marginTop: 12 },
		// Timestamps read left to right whatever the transcript does — otherwise the bidi algorithm
		// takes "-->" for a neutral inside a right-to-left line and flips it. Only the alignment follows.
		metadata: { fontSize: 9, fontWeight: 700, color: palette.muted, textAlign: align, direction: 'ltr' as const, marginBottom: 3 },
		body: { fontSize: 11, lineHeight: 1.45, color: palette.ink, textAlign: align, direction },
		// The footer would inherit the page's direction and print "31 / 7"; it stays left to right.
		footer: { position: 'absolute', bottom: 24, left: 52, right: 52, textAlign: 'center', fontSize: 9, color: palette.muted, direction: 'ltr' },
	})
}

/**
 * Bidi isolates and marks are invisible in a browser, but a PDF font has no glyph for them and
 * draws a tofu box instead. react-pdf resolves the direction of each run itself, so they can go.
 */
function plain(text: string) {
	return text.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
}

export interface TranscriptDocumentProps {
	segments: Segment[]
	summary: string
	options: TranscriptExportOptions
	labels: { transcript: string; summary: string }
}

/**
 * The exported transcript.
 *
 * Bidi is react-pdf's job here: its layout engine resolves embedding levels with the Unicode
 * algorithm, breaks lines in logical order and reorders each finished line — which is why the
 * Hebrew reads right to left while the English words, numbers and brackets inside it do not flip.
 */
export function TranscriptDocument({ segments, summary, options, labels }: TranscriptDocumentProps) {
	const palette = PALETTES[options.theme === 'dark' ? 'dark' : 'light']
	const styles = sheet(palette, options.direction)
	const title = options.title.trim()
	const both = options.content === 'both'
	const showTranscript = includesTranscript(options.content)
	const showSummary = includesSummary(options.content) && Boolean(summary.trim())

	return (
		<Document title={title || 'Transcript'}>
			<Page size="A4" style={styles.page}>
				{title && <Text style={styles.title}>{plain(title)}</Text>}

				{showTranscript && both && <Text style={styles.heading}>{plain(labels.transcript)}</Text>}
				{showTranscript &&
					segments.map((segment, index) => {
						const text = segment.text.trim()
						if (!text) return null
						const metadata = segmentMetadata(segment, options)
						return (
							<View key={index} style={styles.block} wrap>
								{metadata && <Text style={styles.metadata}>{plain(metadata)}</Text>}
								<Text style={styles.body}>{plain(text)}</Text>
							</View>
						)
					})}

				{showSummary && both && <Text style={styles.heading}>{plain(labels.summary)}</Text>}
				{showSummary &&
					summary
						.split(/\n{2,}/)
						.map((paragraph) => paragraph.trim())
						.filter(Boolean)
						.map((paragraph, index) => (
							<View key={index} style={styles.block}>
								<Text style={styles.body}>{plain(paragraph)}</Text>
							</View>
						))}

				<Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
			</Page>
		</Document>
	)
}
