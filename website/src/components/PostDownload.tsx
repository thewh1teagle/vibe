import { m } from '../paraglide/messages.js'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import SupportButton from './SupportButton'

interface PostDownloadProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onOpenKofi: () => void
}

const steps = ['Open the installer from your Downloads folder.', 'Follow the installer prompts.', 'Launch Vibe and drop in an audio or video file.']

export default function PostDownload({ open, onOpenChange, onOpenKofi }: PostDownloadProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[92vw] max-w-md p-7">
				<div className="flex flex-col gap-2">
					<p className="eyebrow">{m.download()}</p>
					<h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground">{m['your-download-is-starting']()}</h3>
					<p className="text-[13px] leading-6 text-muted-foreground">{m['download-starting-description']()}</p>
				</div>

				<ol className="mt-6 flex flex-col divide-y divide-border border-y border-border">
					{steps.map((step, index) => (
						<li key={step} className="flex items-center gap-3 py-3">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
								{index + 1}
							</span>
							<span className="text-[13px] leading-6 text-foreground">{step}</span>
						</li>
					))}
				</ol>

				<div className="mt-6 flex flex-col items-center gap-3">
					<p className="text-[13px] text-muted-foreground">{m['support-while-you-wait']()}</p>
					<SupportButton onOpenKofi={onOpenKofi} />
				</div>
			</DialogContent>
		</Dialog>
	)
}
