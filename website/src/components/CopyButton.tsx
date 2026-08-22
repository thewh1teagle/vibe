import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
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

	useEffect(() => () => void (timeoutRef.current && clearTimeout(timeoutRef.current)), [])

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={m.copy()}
			title={m.copy()}
			className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground">
			{copied ? <Check className="size-3.5" strokeWidth={2} aria-hidden /> : <Copy className="size-3.5" strokeWidth={2} aria-hidden />}
		</button>
	)
}
