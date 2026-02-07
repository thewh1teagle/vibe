import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import SupportButton from './SupportButton'

interface PostDownloadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenKofi: () => void
}

export default function PostDownload({ open, onOpenChange, onOpenKofi }: PostDownloadProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md p-6">
        <h3 className="text-center text-xl font-semibold">{t('your-download-is-starting')}</h3>
        <p className="py-2 text-center text-sm text-muted-foreground">{t('download-starting-description')}</p>
        <p className="mt-5 text-center text-sm">{t('support-while-you-wait')}</p>
        <div className="mt-4 flex justify-center">
          <SupportButton onOpenKofi={onOpenKofi} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
