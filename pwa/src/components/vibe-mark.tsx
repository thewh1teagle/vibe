import { useId } from 'react'

import { cn } from '~/lib/style'

/**
 * The Vibe mark, inlined from `design/logo.svg` (the same file the website
 * serves as its favicon and the desktop app ships as its application icon).
 *
 * Inlined rather than an <img> so it is crisp at any size, needs no second
 * request, and paints with the first frame — the header would otherwise show a
 * gap on a cold, offline load. The gradient ids are suffixed per instance
 * because SVG ids are document-global and the mark may appear more than once.
 */
export function VibeMark({ className }: { className?: string }) {
	const uid = useId().replace(/:/g, '')
	const badge = `vibe-badge-${uid}`
	const ink = `vibe-ink-${uid}`
	const gold = `vibe-gold-${uid}`

	return (
		<svg viewBox="0 0 169 169" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vibe" className={cn('shrink-0', className)}>
			<defs>
				<radialGradient id={badge} cx="50%" cy="36%" r="80%">
					<stop offset="0%" stopColor="#FFFFFF" />
					<stop offset="100%" stopColor="#F2F3F1" />
				</radialGradient>
				<linearGradient id={ink} x1="62" y1="14" x2="110" y2="118" gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="#4C8DF6" />
					<stop offset="55%" stopColor="#6D7CEF" />
					<stop offset="100%" stopColor="#8E6CE6" />
				</linearGradient>
				<linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#FFE082" />
					<stop offset="100%" stopColor="#F4B400" />
				</linearGradient>
			</defs>

			<circle cx="84.5" cy="84.5" r="84.5" fill={`url(#${badge})`} />
			<circle cx="84.5" cy="84.5" r="81.75" stroke={`url(#${ink})`} strokeWidth="4.5" />

			<rect x="62.4" y="14.6" width="44.2" height="85.2" rx="22.1" fill={`url(#${ink})`} />
			<rect x="65.4" y="17.6" width="38.2" height="79.2" rx="19.1" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.5" />

			<path d="M48.5 72 A36 36 0 0 0 120.5 72" stroke={`url(#${ink})`} strokeWidth="8" strokeLinecap="round" />
			<rect x="80.62" y="106" width="7.76" height="48.5" rx="3.88" fill={`url(#${ink})`} />

			<path
				d="M90 41.7 Q92.7 53.9 95 56.2 Q97.3 58.4 105 56.9 Q97.3 55.5 95 57.7 Q92.7 59.9 90 72.1 Q87.3 59.9 85 57.7 Q82.7 55.5 75 56.9 Q82.7 58.4 85 56.2 Q87.3 53.9 90 41.7 Z"
				fill={`url(#${gold})`}
			/>
			<path
				d="M75 56.9 Q76.3 62.6 77.4 63.7 Q78.5 64.7 82.1 64 Q78.5 63.3 77.4 64.4 Q76.3 65.4 75 71.1 Q73.7 65.4 72.6 64.4 Q71.5 63.3 67.9 64 Q71.5 64.7 72.6 63.7 Q73.7 62.6 75 56.9 Z"
				fill={`url(#${gold})`}
			/>
			<path
				d="M80 42.3 Q80.9 46.2 81.6 46.9 Q82.4 47.6 84.9 47.2 Q82.4 46.7 81.6 47.4 Q80.9 48.1 80 52.1 Q79.1 48.1 78.4 47.4 Q77.6 46.7 75.1 47.2 Q77.6 47.6 78.4 46.9 Q79.1 46.2 80 42.3 Z"
				fill={`url(#${gold})`}
			/>
		</svg>
	)
}
