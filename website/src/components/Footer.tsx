import { m } from '../paraglide/messages.js'
import { Link } from 'react-router-dom'
import Discord from '~/icons/Discord'
import Github from '~/icons/Github'
import Logo from '~/icons/Logo'

interface FooterProps {
	onOpenKofi: () => void
	onOpenPrivacyPolicy: () => void
}

const linkClass = 'text-sm text-start text-muted-foreground transition-colors hover:text-foreground'
const iconClass =
	'inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

export default function Footer({ onOpenKofi, onOpenPrivacyPolicy }: FooterProps) {
	return (
		<footer className="mt-24 border-t border-border">
			<div className="site-container flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between md:gap-16">
				{/* Brand + tagline + social */}
				<div className="flex flex-col items-start gap-4">
					<Link to="/" className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80">
						<Logo className="size-6" />
						<span className="text-[15px] font-semibold tracking-[-0.03em]">Vibe</span>
					</Link>
					<p className="max-w-[36ch] text-start text-sm text-muted-foreground">{m.title()}</p>
					<div className="flex items-center gap-2">
						<a className={iconClass} href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer" aria-label="GitHub">
							<Github width="16" height="16" />
						</a>
						<a className={iconClass} href="https://discord.gg/EcxWSstQN8" target="_blank" rel="noreferrer" aria-label="Discord">
							<Discord className="size-4" />
						</a>
					</div>
					<p className="mt-2 text-xs text-muted-foreground" dir="ltr">
						© {new Date().getFullYear()} Vibe
					</p>
				</div>

				{/* Link columns */}
				<nav className="flex flex-wrap gap-x-10 gap-y-4 md:gap-x-16">
					<div className="flex flex-col items-start gap-3">
						<Link className={linkClass} to="/">
							{m.home()}
						</Link>
						<Link className={linkClass} to="/features">
							{m.features()}
						</Link>
						<Link className={linkClass} to="/docs">
							{m.documentation()}
						</Link>
						<Link className={linkClass} to="/changelog">
							{m.changelog()}
						</Link>
					</div>
					<div className="flex flex-col items-start gap-3">
						<button className={linkClass} onClick={onOpenKofi}>
							{m['support-vibe']()}
						</button>
						<button className={linkClass} onClick={onOpenPrivacyPolicy}>
							{m['privacy-policy']()}
						</button>
						<a className={linkClass} href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
							GitHub
						</a>
					</div>
				</nav>
			</div>
		</footer>
	)
}
