import { Check, Copy, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '~/components/ui/button'
import { encodeQr } from '~/lib/qr'
import { m } from '~/paraglide/messages.js'
import { IconAction } from './shared'

/** Decorative device illustration; pairing itself always uses the unmodified QR below. */
export function PhoneIllustration() {
	return (
		<div aria-hidden="true" className="relative flex h-32 items-center justify-center overflow-hidden bg-linear-to-b from-blue-500/10 to-transparent">
			<div className="absolute top-3 h-24 w-52 rounded-full bg-blue-400/15 blur-2xl" />
			<svg viewBox="0 0 280 128" className="relative h-32 w-70" fill="none">
				<rect x="91" y="24" width="139" height="86" rx="9" className="fill-card stroke-foreground/40" strokeWidth="2" />
				<rect x="99" y="32" width="123" height="69" rx="4" className="fill-blue-500/10" />
				<path d="M80 111h162l-6 6H87z" className="fill-muted stroke-foreground/40" strokeWidth="2" strokeLinejoin="round" />
				<rect x="121" y="48" width="14" height="14" rx="4" className="fill-blue-500/25" />
				<path d="m125 55 3 3 5-6" className="stroke-blue-500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M145 52h46M145 59h29M121 75h76M121 83h62" className="stroke-foreground/20" strokeWidth="3" strokeLinecap="round" />
				<g transform="rotate(-8 69 76)">
					<rect x="43" y="32" width="51" height="87" rx="11" className="fill-card stroke-foreground/65" strokeWidth="2.5" />
					<rect x="48" y="37" width="41" height="77" rx="7" className="fill-blue-500/15" />
					<path d="M62 40h13" className="stroke-foreground/60" strokeWidth="3" strokeLinecap="round" />
					<path d="M55 74v5m6-12v19m7-25v30m7-23v17m6-12v6" className="stroke-blue-500" strokeWidth="3" strokeLinecap="round" />
					<circle cx="69" cy="102" r="4" className="fill-blue-500" />
				</g>
			</svg>
		</div>
	)
}

/**
 * QR codes are read optically, so the colours are hard-coded rather than themed:
 * a dark-on-dark code in dark mode does not scan.
 */
function QrCode({ value, size }: { value: string; size: number }) {
	const matrix = useMemo(() => {
		try {
			return encodeQr(value)
		} catch (error) {
			console.error(error)
			return null
		}
	}, [value])

	if (!matrix) return <p className="text-xs text-destructive">{m.pairingQrCodeError()}</p>

	const quietZone = 4
	const dimension = matrix.length + quietZone * 2
	let path = ''
	for (let y = 0; y < matrix.length; y++) {
		for (let x = 0; x < matrix.length; x++) {
			if (matrix[y][x]) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`
		}
	}

	return (
		<svg width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" role="img" aria-label={m.pairingQrCode()}>
			<rect width={dimension} height={dimension} fill="#ffffff" />
			<path d={path} fill="#000000" />
		</svg>
	)
}

interface PhonePairingPanelProps {
	pairingUrl: string | null
	busy: boolean
	copied: boolean
	error: string | null
	onCopy: () => void
	onRegenerate: () => void
}

export function PhonePairingPanel({ pairingUrl, busy, copied, error, onCopy, onRegenerate }: PhonePairingPanelProps) {
	return (
		<section className="overflow-hidden rounded-xl border border-border/60 bg-muted/10">
			<PhoneIllustration />
			<div className="px-5 pb-4">
				<p className="mx-auto flex min-h-9 max-w-72 items-center justify-center text-center text-xs leading-relaxed">{m.scanPairingCodeInfo()}</p>
				<div className="mt-4 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
					<div className="mx-auto flex h-[216px] w-[216px] max-w-full items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-xs">
						{pairingUrl ? <QrCode value={pairingUrl} size={208} /> : <p className="text-center text-xs text-neutral-600">{m.noPairingCode()}</p>}
					</div>
					<div className="mt-2 flex items-center justify-center gap-1">
						<Button variant="ghost" size="sm" className="text-xs font-medium" disabled={!pairingUrl || busy} onClick={onCopy}>
							{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
							{copied ? m.copied() : m.copyPairingLink()}
						</Button>
						<IconAction
							label={m.regeneratePairingCode()}
							icon={<RefreshCw aria-hidden="true" className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
							disabled={busy}
							onClick={onRegenerate}
						/>
					</div>
				</div>
				{error && (
					<p role="alert" className="mt-3 text-xs text-destructive">
						{error}
					</p>
				)}
			</div>
		</section>
	)
}
