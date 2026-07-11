import { useEffect, useRef, useState } from 'react'
import { Check, Languages } from 'lucide-react'
import { m } from '../paraglide/messages.js'
import type { Locale } from '../paraglide/runtime.js'

interface LanguageSelectorProps {
	locale: Locale
	availableLocales: readonly Locale[]
	onLocaleChange: (locale: Locale) => void
}

export default function LanguageSelector({ locale, availableLocales, onLocaleChange }: LanguageSelectorProps) {
	const [open, setOpen] = useState(false)
	const menuRef = useRef<HTMLLIElement>(null)
	const languageNames = new Intl.DisplayNames([locale], { type: 'language' })

	useEffect(() => {
		function closeOnOutsideClick(event: MouseEvent) {
			if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', closeOnOutsideClick)
		return () => document.removeEventListener('mousedown', closeOnOutsideClick)
	}, [])

	return (
		<li ref={menuRef} className="relative">
			<button type="button" aria-label={m.language()} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Languages aria-hidden="true" className="size-4" />
			</button>
			{open && (
				<div className="absolute top-full right-0 z-50 mt-2 min-w-52 rounded-xl border border-white/15 bg-popover/75 p-1.5 text-popover-foreground shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-popover/65">
					{availableLocales.map((code) => (
						<button key={code} type="button" onClick={() => { onLocaleChange(code); setOpen(false) }} className="flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-accent">
							<span>{languageNames.of(code) ?? code}</span>
							{code === locale && <Check aria-hidden="true" className="size-3.5 text-primary" />}
						</button>
					))}
				</div>
			)}
		</li>
	)
}
