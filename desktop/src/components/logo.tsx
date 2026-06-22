import { CSSProperties } from 'react'

interface LogoProps {
	size?: number
	className?: string
	style?: CSSProperties
}

export function Logo({ size = 36, className, style }: LogoProps) {
	return (
		<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width={size} height={size} className={className} style={style} aria-label="vibe-simplify">
			<circle cx="50" cy="50" r="42" fill="#7c3aed" />
			<rect x="20" y="48" width="3" height="4" rx="1.5" fill="#fff" />
			<rect x="26" y="44" width="3" height="12" rx="1.5" fill="#fff" />
			<rect x="32" y="40" width="3" height="20" rx="1.5" fill="#fff" />
			<rect x="38" y="34" width="3" height="32" rx="1.5" fill="#fff" />
			<rect x="44" y="42" width="3" height="16" rx="1.5" fill="#fff" />
			<rect x="50" y="38" width="3" height="24" rx="1.5" fill="#fff" />
			<rect x="56" y="30" width="3" height="40" rx="1.5" fill="#fff" />
			<rect x="62" y="36" width="3" height="28" rx="1.5" fill="#fff" />
			<rect x="68" y="40" width="3" height="20" rx="1.5" fill="#fff" />
			<rect x="74" y="46" width="3" height="8" rx="1.5" fill="#fff" />
		</svg>
	)
}
