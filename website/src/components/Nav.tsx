import { m } from '../paraglide/messages.js'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '~/components/ui/button'
import Logo from '~/icons/Logo'
import type { Locale } from '../paraglide/runtime.js'
import LanguageSelector from './LanguageSelector'

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
		const scrollToDownload = () => {
			const target = document.getElementById('download')
			if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
			else window.scrollTo({ top: 0, behavior: 'smooth' })
		}

		if (location.pathname === '/') {
			scrollToDownload()
			return
		}
		navigate('/')
		requestAnimationFrame(scrollToDownload)
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
