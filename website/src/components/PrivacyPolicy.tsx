import { Dialog, DialogContent } from '~/components/ui/dialog'
import { m } from '~/paraglide/messages.js'

interface PrivacyPolicyProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function PrivacyPolicy({ open, onOpenChange }: PrivacyPolicyProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="m-0 !h-[80vh] !w-[95vw] !max-w-[880px] select-none overflow-hidden !p-0 sm:!h-[96vh] sm:!w-[75vw]">
				<iframe src="/vibe/privacy_policy.pdf" className="m-0 h-full w-full border-0 p-0" title={m['privacy-policy']()} />
			</DialogContent>
		</Dialog>
	)
}
