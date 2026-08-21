import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { m } from '~/paraglide/messages.js'

interface DocViewerProps {
	content: string
}

export default function DocViewer({ content }: DocViewerProps) {
	const [html, setHtml] = useState<string>(m.loading())

	useEffect(() => {
		if (!content) {
			setHtml(m.noDocumentSelected())
			return
		}

		try {
			const result = marked(content)
			setHtml(typeof result === 'string' ? result : '')
		} catch (error: unknown) {
			console.error('Error rendering document:', error)
			setHtml(m.failedToLoadDocument())
		}
	}, [content])

	return (
		<div className="min-h-screen">
			<div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	)
}
