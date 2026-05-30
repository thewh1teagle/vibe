import { useTranslation } from 'react-i18next'
import { viewModel } from './view-model'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()

	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-6">
			<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{t('common.setup', { defaultValue: 'Setup' })}</p>
			<div className="text-balance text-2xl font-semibold md:text-3xl">{t('common.downloading-model', { company: vm.modelCompany })}</div>

			<div className="mt-6 flex flex-col items-center gap-3">
				{vm.downloadProgress > 0 && (
					<>
						<Progress className="w-full max-w-sm" value={vm.downloadProgress} />
						{!vm?.location?.state?.downloadURL && <p className="text-sm text-muted-foreground">{t('common.this-happens-once')}</p>}
					</>
				)}
				{(vm.downloadProgress === 0 || vm.isOnline === null) && <Spinner className="h-8 w-8" />}
				<p className="text-xs text-muted-foreground/60 mt-1">If the download is very slow, try turning off your VPN.</p>
			</div>

			<Dialog open={vm.isOnline === false}>
				<DialogContent className="max-w-sm rounded-xl">
					<DialogHeader>
						<DialogTitle>{t('common.no-connection')}</DialogTitle>
					</DialogHeader>
					<p className="mt-3 text-center text-muted-foreground">{t('common.info-manual-download')}</p>
					<div className="mt-5 flex flex-col justify-center gap-2">
						<Button className="flex-1" onClick={vm.downloadIfOnline}>
							{t('common.try-again')}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default App
