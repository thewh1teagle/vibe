import { m } from '../paraglide/messages.js'
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'

interface SupportButtonProps {
	onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
	return (
		<Button
			onClick={onOpenKofi}
			className="cursor-pointer border-0 bg-rose-500 text-white shadow-[0_2px_12px_rgb(244_63_94/0.35)] transition-colors hover:bg-rose-600 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-400">
			<Heart className="size-4 fill-white text-white" />
			{m['support-project']()}
		</Button>
	)
}
