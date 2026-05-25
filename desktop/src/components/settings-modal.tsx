import SettingsPage from '~/pages/settings/page'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { ScrollArea } from '~/components/ui/scroll-area'

interface SettingsModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[85vh] max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-card/95 p-0 shadow-xl">
				<DialogHeader className="px-6 pb-3 pt-5">
					<DialogTitle className="text-2xl font-semibold">Settings</DialogTitle>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 px-6 pb-5 pt-2">
					<SettingsPage />
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
