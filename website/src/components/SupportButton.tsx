import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'

interface SupportButtonProps {
	onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
	const { t } = useTranslation()

	return (
		<Button
			className="cursor-pointer bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm shadow-rose-500/30 hover:from-rose-600 hover:to-red-600 active:from-rose-700 active:to-red-700 dark:from-rose-500 dark:to-red-500 dark:hover:from-rose-600 dark:hover:to-red-600 dark:active:from-rose-700 dark:active:to-red-700"
			onClick={onOpenKofi}>
			{t('support-project')}
			<Heart className="fill-rose-50" />
		</Button>
	)
}
