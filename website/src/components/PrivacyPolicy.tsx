import { Dialog, DialogContent } from '~/components/ui/dialog'

interface PrivacyPolicyProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function PrivacyPolicy({ open, onOpenChange }: PrivacyPolicyProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="m-0 h-[90vh] w-[90vw] max-w-[800px] select-none overflow-y-auto p-0">
				<div className="m-0 h-full w-full overflow-y-auto p-0">
					<iframe src="/vibe/privacy_policy.pdf" className="m-0 h-full w-full p-0" title="Privacy Policy" />
				</div>
			</DialogContent>
		</Dialog>
	)
}
