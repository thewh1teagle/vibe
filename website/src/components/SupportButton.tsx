import { m } from '../paraglide/messages.js'
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'

interface SupportButtonProps {
	onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
	return (
		<Button variant="outline" className="cursor-pointer" onClick={onOpenKofi}>
			<Heart className="size-4 text-muted-foreground" />
			{m['support-project']()}
		</Button>
	)
}
