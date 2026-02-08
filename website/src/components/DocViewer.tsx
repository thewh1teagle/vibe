import { useEffect, useState } from 'react'
import { marked } from 'marked'

interface DocViewerProps {
	content: string
}

export default function DocViewer({ content }: DocViewerProps) {
	const [html, setHtml] = useState('Loading...')

	useEffect(() => {
		if (!content) {
			setHtml('No document selected.')
			return
		}

		try {
			const result = marked(content)
			setHtml(typeof result === 'string' ? result : '')
		} catch (error: unknown) {
			console.error('Error rendering document:', error)
			setHtml('Failed to load document.')
		}
	}, [content])

	return (
		<div className="min-h-screen">
			<div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	)
}
