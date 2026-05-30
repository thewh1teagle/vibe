import SettingsPage from '~/pages/settings/page'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { ScrollArea } from '~/components/ui/scroll-area'

interface SettingsModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="fixed inset-0 left-0 top-0 flex !h-screen !w-screen !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none !border-0 !bg-background !p-0 !shadow-none !max-h-screen">
				<div className="flex items-center justify-between px-6 pt-6 pb-2">
					<DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
				</div>
				<ScrollArea className="min-h-0 flex-1 px-6 pb-6">
					<SettingsPage />
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
