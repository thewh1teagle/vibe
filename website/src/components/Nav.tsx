import { m } from '../paraglide/messages.js'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/button'
import Github from '~/icons/Github'
import Logo from '~/icons/Logo'
import type { Locale } from '../paraglide/runtime.js'
import LanguageSelector from './LanguageSelector'

interface NavProps {
	locale: Locale
	availableLocales: readonly Locale[]
	onLocaleChange: (locale: Locale) => void
}

export default function Nav({ locale, availableLocales, onLocaleChange }: NavProps) {

	return (
		<div className="mx-auto mt-3 flex w-full items-center justify-between px-3 py-2 lg:max-w-[1065px]">
			<div className="flex-1">
				<Button variant="ghost" asChild className="text-sm lg:text-xl">
					<Link to="/" aria-label={m.home()}>
						<Logo className="size-7 lg:size-8" />
						<span className="opacity-95">Vibe</span>
					</Link>
				</Button>
			</div>
			<ul className="flex items-center gap-2 px-1" dir="ltr">
				<LanguageSelector locale={locale} availableLocales={availableLocales} onLocaleChange={onLocaleChange} />
				<a href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
					<Github width="28" height="28" />
				</a>
			</ul>
		</div>
	)
}
