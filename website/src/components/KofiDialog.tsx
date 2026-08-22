import { Dialog, DialogContent } from '~/components/ui/dialog'

interface KofiDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function KofiDialog({ open, onOpenChange }: KofiDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="h-[75dvh] w-[86vw] max-w-[560px] overflow-hidden rounded-2xl border border-border bg-white p-0 md:h-[90vh] md:w-[430px] md:max-w-[430px]">
				<div className="h-full w-full overflow-hidden rounded-2xl bg-white p-0">
					<iframe
						src="https://ko-fi.com/thewh1teagle/?hidefeed=true&widget=true&embed=true&preview=true"
						style={{ border: 'none', width: '100%', height: '100%', padding: '4px', background: '#f9f9f9' }}
						title="thewh1teagle"
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
