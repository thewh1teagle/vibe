import { Dialog, DialogContent } from '~/components/ui/dialog'

interface PrivacyPolicyProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function PrivacyPolicy({ open, onOpenChange }: PrivacyPolicyProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="m-0 !h-[96vh] !w-[75vw] !max-w-[1500px] select-none overflow-hidden !p-0 sm:!max-w-[1500px]">
				<iframe src="/vibe/privacy_policy.pdf" className="m-0 h-full w-full border-0 p-0" title="Privacy Policy" />
			</DialogContent>
		</Dialog>
	)
}
