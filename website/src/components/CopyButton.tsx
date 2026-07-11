import { useCallback, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'

export default function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(text)
		setCopied(true)
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => setCopied(false), 2000)
	}, [text])

	return (
		<button
			onClick={handleCopy}
			className="cursor-pointer shrink-0 p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
			title={m.copy()}
		>
			{copied ? (
				<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			) : (
				<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
			)}
		</button>
	)
}
