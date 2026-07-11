import { m } from '../paraglide/messages.js'
import { Link } from 'react-router-dom'
import Discord from '~/icons/Discord'
import Github from '~/icons/Github'

interface FooterProps {
	onOpenKofi: () => void
	onOpenPrivacyPolicy: () => void
}

export default function Footer({ onOpenKofi, onOpenPrivacyPolicy }: FooterProps) {

	return (
		<footer className="mt-36 rounded-xl border border-border bg-card/60 p-10 text-foreground">
			<nav className="flex flex-row flex-wrap justify-center gap-4">
				<Link className="underline-offset-4 hover:underline" to="/">
					{m.home()}
				</Link>
				<button className="underline-offset-4 hover:underline" onClick={onOpenKofi}>
					{m["support-vibe"]()}
				</button>
				<button className="underline-offset-4 hover:underline" onClick={onOpenPrivacyPolicy}>
					{m["privacy-policy"]()}
				</button>
				<Link className="underline-offset-4 hover:underline" to="/features">
					{m.features()}
				</Link>
				<Link className="underline-offset-4 hover:underline" to="/docs">
					{m.documentation()}
				</Link>
			</nav>
			<nav className="mt-6 flex justify-center">
				<div className="flex items-center justify-center gap-4">
					<a
						className="inline-flex size-6 items-center justify-center"
						href="https://github.com/thewh1teagle/vibe"
						target="_blank"
						rel="noreferrer">
						<Github width="24" height="24" />
					</a>
					<div className="h-6 w-px bg-border" />
					<a
						className="inline-flex size-6 items-center justify-center"
						href="https://discord.gg/EcxWSstQN8"
						target="_blank"
						rel="noreferrer">
						<Discord />
					</a>
				</div>
			</nav>
			<aside className="mt-4 text-center text-sm text-muted-foreground">
				<p>Vibe - {m.title()}</p>
			</aside>
		</footer>
	)
}
