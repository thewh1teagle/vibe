import { m } from '../paraglide/messages.js'
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'

interface SupportButtonProps {
	onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
	return (
		<Button
			variant="outline"
			onClick={onOpenKofi}
			className="cursor-pointer border-rose-500/30 bg-rose-500/10 text-foreground transition-colors hover:border-rose-500/50 hover:bg-rose-500/15 dark:border-rose-400/25 dark:bg-rose-400/10 dark:hover:bg-rose-400/15">
			<Heart className="size-4 fill-rose-500 text-rose-500" />
			{m['support-project']()}
		</Button>
	)
}
