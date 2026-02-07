import { useTranslation } from 'react-i18next'
import { viewModel } from './viewModel'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()

	return (
		<div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
			<div className="text-3xl m-5 font-bold">{t('common.downloading-model', { company: vm.modelCompany })}</div>
			{vm.downloadProgress > 0 && (
				<>
					<Progress className="w-56 my-2" value={vm.downloadProgress} />
					{!vm?.location?.state?.downloadURL && <p>{t('common.this-happens-once')}</p>}
				</>
			)}
			{(vm.downloadProgress === 0 || vm.isOnline === null) && <Spinner className="h-8 w-8" />}

			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="sm" className="mt-6 text-destructive text-xs" onClick={vm.cancelSetup}>
						{t('common.cancel')}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{t('common.info-cancel-download')}</TooltipContent>
			</Tooltip>

			<Dialog open={vm.isOnline === false}>
				<DialogContent>
					<div className="text-3xl text-center">{t('common.no-connection')}</div>
					<p className="mt-3 text-center">{t('common.info-manual-download')}</p>
					<div className="flex flex-col justify-center mt-5 gap-2">
						<Button className="flex-1" onClick={vm.downloadIfOnline}>
							{t('common.try-again')}
						</Button>
						<Button variant="secondary" size="sm" onClick={vm.cancelSetup}>
							{t('common.i-prefer-manual-setup')}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default App
