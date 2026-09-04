import { m } from '../paraglide/messages.js'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '~/components/ui/button'
import Logo from '~/icons/Logo'
import type { Locale } from '../paraglide/runtime.js'
import LanguageSelector from './LanguageSelector'
import { requestDownloadWhenReady } from '~/lib/download-intent'
import { Moon, Sun } from 'lucide-react'

interface NavProps {
	locale: Locale
	availableLocales: readonly Locale[]
	onLocaleChange: (locale: Locale) => void
}

export default function Nav({ locale, availableLocales, onLocaleChange }: NavProps) {
	const navigate = useNavigate()
	const location = useLocation()

	function onDownloadClick(event: React.MouseEvent<HTMLAnchorElement>) {
		event.preventDefault()
		if (location.pathname !== '/') navigate('/')
		requestDownloadWhenReady()
	}

	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
			<div className="site-container flex h-16 items-center gap-6">
				<Link to="/" aria-label={m.home()} className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80">
					<Logo className="size-7" />
					<span className="text-[17px] font-semibold tracking-[-0.03em]">Vibe</span>
				</Link>

				<nav className="hidden items-center sm:flex">
					<Link to="/features" className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
						{m.features()}
					</Link>
				</nav>

				<ul className="ms-auto flex items-center gap-4">
					{import.meta.env.DEV && (
						<button
							type="button"
							aria-label="Toggle theme (dev)"
							onClick={() => document.documentElement.classList.toggle('dark')}
							className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
							<Sun className="size-4 dark:hidden" />
							<Moon className="hidden size-4 dark:block" />
						</button>
					)}
					{import.meta.env.DEV && (
						<LanguageSelector locale={locale} availableLocales={availableLocales} onLocaleChange={onLocaleChange} showDevBadge />
					)}
					<li>
						<Button size="sm" asChild>
							<a href="#download" onClick={onDownloadClick}>
								{m.download()}
							</a>
						</Button>
					</li>
				</ul>
			</div>
		</header>
	)
}
