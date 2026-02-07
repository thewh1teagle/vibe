import { useEffect, useState } from 'react'
import { marked } from 'marked'

interface DocViewerProps {
	url: string
}

export default function DocViewer({ url }: DocViewerProps) {
	const [html, setHtml] = useState('Loading...')

	useEffect(() => {
		if (!url) {
			setHtml('No document selected.')
			return
		}

		let cancelled = false
		setHtml('Loading...')

		fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
				}

				return response.text()
			})
			.then((text) => marked(text))
			.then((result) => {
				if (!cancelled) {
					setHtml(typeof result === 'string' ? result : '')
				}
			})
			.catch((error: unknown) => {
				console.error('Error loading document:', error)
				if (!cancelled) {
					setHtml('Failed to load document.')
				}
			})

		return () => {
			cancelled = true
		}
	}, [url])

	return (
		<div className="min-h-screen">
			<div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	)
}
