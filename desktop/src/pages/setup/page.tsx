import { useTranslation } from 'react-i18next'
import { viewModel } from './view-model'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()
	const selectedPreset = vm.presets.find((p) => p.id === vm.selectedPresetId) ?? vm.presets[0]

	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-6">
			<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{t('common.setup', { defaultValue: 'Setup' })}</p>

			{!vm.isDownloading ? (
				<>
					<div className="text-balance text-2xl font-semibold md:text-3xl">{t('common.model-select-prompt')}</div>
					<div className="mt-6 w-full max-w-sm space-y-3">
						<Label>{t('common.select-model')}</Label>
						<Select value={vm.selectedPresetId} onValueChange={(value) => vm.setSelectedPresetId(value as typeof vm.selectedPresetId)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{vm.presets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{t(preset.nameKey)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-sm text-muted-foreground">{t(selectedPreset.descriptionKey)}</p>
						<Button className="w-full" onClick={vm.startDownload}>
							{t('common.model-download')}
						</Button>
						{vm.hasLocalModels && (
							<Button variant="ghost" className="w-full" onClick={vm.goBack}>
								{t('common.back')}
							</Button>
						)}
					</div>
				</>
			) : (
				<>
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
						<Button variant="ghost" className="mt-2" onClick={vm.cancelDownload}>
							{t('common.cancel')}
						</Button>
					</div>
				</>
			)}

			<Dialog open={vm.isOnline === false && vm.hasAttempted}>
				<DialogContent className="max-w-sm rounded-xl">
					<DialogHeader>
						<DialogTitle>{t('common.no-connection')}</DialogTitle>
					</DialogHeader>
					<p className="mt-3 text-center text-muted-foreground">{t('common.info-manual-download')}</p>
					<div className="mt-5 flex flex-col justify-center gap-2">
						<Button className="flex-1" onClick={vm.startDownload}>
							{t('common.try-again')}
						</Button>
						{vm.hasLocalModels && (
							<Button variant="ghost" className="flex-1" onClick={vm.goBack}>
								{t('common.back')}
							</Button>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default App
