import { Share, Plus, X, Smartphone } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { useInstall } from '~/lib/use-install'

interface Props {
	/**
	 * `pre-pairing` is shown in the unpaired empty state and argues for
	 * installing *first*: on iOS the installed app gets its own storage, so a
	 * pairing scanned in Safari does not follow you into the installed app.
	 */
	variant: 'pre-pairing' | 'subtle'
}

export function InstallHint({ variant }: Props) {
	const { mode, install, dismiss } = useInstall()
	if (mode === 'none') return null

	const prePairing = variant === 'pre-pairing'

	return (
		<div className={prePairing ? 'rounded-2xl border border-border bg-muted/60 p-4' : 'mt-2 rounded-xl border border-border p-3'}>
			<div className="flex items-start gap-3">
				<Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">Add Vibe Phone to your home screen</p>

					{mode === 'ios-manual' ? (
						<p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
							Tap <Share className="inline size-3.5" /> Share, then <Plus className="inline size-3.5" /> Add to Home Screen.
						</p>
					) : null}

					<p className="mt-1 text-xs text-muted-foreground">
						{prePairing
							? 'Install first, then scan the QR code from inside the installed app — on iOS the installed app keeps its own storage, so a pairing made in the browser does not carry over.'
							: 'It opens full screen, and keeps your pairing from being cleared when the browser tidies up unused sites.'}
					</p>

					{mode === 'prompt' && (
						<Button size="sm" className="mt-3 h-10" onClick={() => void install()}>
							Add to home screen
						</Button>
					)}
				</div>
				<button
					type="button"
					onClick={dismiss}
					aria-label="Dismiss"
					className="-m-2 shrink-0 cursor-pointer p-2 text-muted-foreground">
					<X className="size-4" />
				</button>
			</div>
		</div>
	)
}
