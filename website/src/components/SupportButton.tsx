import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'

interface SupportButtonProps {
  onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
  const { t } = useTranslation()

  return (
    <Button className="bg-red-500 text-white hover:bg-red-700" onClick={onOpenKofi}>
      {t('support-project')}
      <Heart />
    </Button>
  )
}
