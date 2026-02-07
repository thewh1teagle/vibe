import { Dialog, DialogContent } from '~/components/ui/dialog'

interface KofiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function KofiDialog({ open, onOpenChange }: KofiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] w-[95vw] max-w-[1100px] overflow-hidden border-white bg-white p-0">
        <div className="h-full w-full rounded-xl bg-white p-0">
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
