import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '~/lib/style'
import { buttonVariants } from '~/components/ui/button'
import { m } from '~/paraglide/messages.js'

interface CopyButtonProps {
	text: string
	/** With a label the button is a labelled pill; without one it is the small icon used on code blocks. */
	label?: string
	/** What the label turns into for a moment after copying. */
	copiedLabel?: string
	/** Spoken name when several copy buttons share a page ("Copy link: Whisper Tiny"). */
	ariaLabel?: string
	/** Drops the visible label below the `sm` breakpoint; pass `ariaLabel` so the button keeps a name. */
	iconOnlyOnPhones?: boolean
	className?: string
}

async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		// No clipboard access (an insecure origin, a denied permission): the selection route still works.
		const field = document.createElement('textarea')
		field.value = text
		field.setAttribute('readonly', '')
		field.style.position = 'fixed'
		field.style.opacity = '0'
		document.body.appendChild(field)
		field.select()
		const copied = document.execCommand('copy')
		field.remove()
		return copied
	}
}

export default function CopyButton({ text, label, copiedLabel, ariaLabel, iconOnlyOnPhones, className }: CopyButtonProps) {
	const [copied, setCopied] = useState(false)
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

	const handleCopy = useCallback(async () => {
		if (!(await copyText(text))) return
		setCopied(true)
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => setCopied(false), 2000)
	}, [text])

	useEffect(() => () => void (timeoutRef.current && clearTimeout(timeoutRef.current)), [])

	const Icon = copied ? Check : Copy

	if (label) {
		const done = copiedLabel ?? label
		return (
			<button
				type="button"
				onClick={handleCopy}
				aria-label={ariaLabel ?? label}
				title={iconOnlyOnPhones ? label : undefined}
				data-copied={copied || undefined}
				className={cn(
					buttonVariants({ variant: 'outline', size: 'sm' }),
					'cursor-pointer',
					iconOnlyOnPhones && 'max-sm:size-8 max-sm:px-0',
					copied && 'border-success/40 text-success hover:text-success',
					className,
				)}>
				<Icon className="size-3.5" strokeWidth={2} aria-hidden />
				{/* Both labels share one cell, so the button keeps its width when the text swaps. */}
				<span className={cn('grid', iconOnlyOnPhones && 'max-sm:hidden')}>
					<span className={cn('col-start-1 row-start-1', copied && 'invisible')}>{label}</span>
					<span aria-hidden className={cn('col-start-1 row-start-1', !copied && 'invisible')}>
						{done}
					</span>
				</span>
				<span role="status" className="sr-only">
					{copied ? done : ''}
				</span>
			</button>
		)
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={ariaLabel ?? m.copy()}
			title={m.copy()}
			className={cn(
				'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground',
				className,
			)}>
			<Icon className="size-3.5" strokeWidth={2} aria-hidden />
		</button>
	)
}
