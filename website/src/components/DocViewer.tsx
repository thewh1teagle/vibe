import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { marked } from 'marked'
import CopyButton from '~/components/CopyButton'
import { m } from '~/paraglide/messages.js'

interface DocViewerProps {
	content: string
}

/**
 * Editorial prose scale, tokens only. Kept local to the component so the
 * markdown rendering stays consistent wherever it is used.
 */
const prose = [
	'max-w-[68ch] text-[15px] leading-7 text-foreground',
	'[&_h1]:mb-4 [&_h1]:mt-12 [&_h1]:text-[1.75rem] [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-[-0.03em] first:[&_h1]:mt-0',
	'[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-[1.3rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:tracking-[-0.02em]',
	'[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-[1.05rem] [&_h3]:font-medium [&_h3]:tracking-[-0.01em]',
	'[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-[15px] [&_h4]:font-medium',
	'[&_p]:mb-4 [&_p]:text-muted-foreground',
	'[&_li]:mb-1.5 [&_li]:text-muted-foreground [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:ps-5',
	'[&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:decoration-foreground',
	'[&_strong]:font-medium [&_strong]:text-foreground',
	'[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground',
	'[&_pre]:relative [&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-[13px] [&_pre]:leading-6',
	'[&_pre_code]:bg-transparent [&_pre_code]:p-0',
	'[&_blockquote]:mb-4 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-4 [&_blockquote]:text-muted-foreground',
	'[&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-border',
	'[&_hr]:my-10 [&_hr]:border-border',
	'[&_table]:mb-5 [&_table]:w-full [&_table]:text-[13px] [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium',
].join(' ')

export default function DocViewer({ content }: DocViewerProps) {
	const [html, setHtml] = useState<string>(m.loading())
	const containerRef = useRef<HTMLDivElement>(null)

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

	// Mount a small ghost copy button into every rendered code block.
	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const roots: Root[] = []
		container.querySelectorAll('pre').forEach((pre) => {
			const text = pre.textContent ?? ''
			if (!text.trim()) return

			const slot = document.createElement('div')
			slot.className = 'absolute end-2 top-2'
			pre.appendChild(slot)

			const root = createRoot(slot)
			root.render(<CopyButton text={text} />)
			roots.push(root)
		})

		return () => {
			const pending = roots
			setTimeout(() => pending.forEach((root) => root.unmount()), 0)
		}
	}, [html])

	return <div ref={containerRef} className={prose} dangerouslySetInnerHTML={{ __html: html }} />
}
