import { useTranslation } from 'react-i18next'
import { viewModel } from './view-model'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()
	const selectedPreset = vm.presets.find((p) => p.id === vm.selectedPresetId) ?? vm.presets[0]

	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-6">
			<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{t('common.setup', { defaultValue: 'Setup' })}</p>

			<div className="text-balance text-2xl font-semibold md:text-3xl">{t('common.model-select-prompt')}</div>

			<div className="mt-6 w-full max-w-sm space-y-4">
				<div className="space-y-2">
					<Label>{t('common.provider')}</Label>
					<div className="flex gap-1.5">
						{(['local', 'groq'] as const).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => vm.setProvider(p)}
								className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
									vm.provider === p
										? 'border-primary/40 bg-primary/8 text-primary shadow-sm'
										: 'border-border/50 bg-background/30 text-muted-foreground hover:bg-accent/30 hover:text-foreground'
								}`}>
								{t(`common.provider-${p}`)}
							</button>
						))}
					</div>
				</div>

				{vm.provider === 'groq' ? (
					<div className="space-y-3">
						<div className="space-y-2">
							<Label>{t('common.groq-api-key')}</Label>
							<p className="text-[11px] text-muted-foreground">{t('common.groq-api-key-description')}</p>
							<Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={vm.openGroqConsole}>
								{t('common.groq-get-api-key')}
								<LinkIcon className="h-3 w-3" />
							</Button>
							<div className="flex items-center gap-2">
								<Input
									type="password"
									value={vm.groqApiKey}
									onChange={(e) => vm.setGroqApiKey(e.target.value)}
									placeholder={t('common.groq-api-key-placeholder')}
									className="flex-1"
								/>
								<Button variant="outline" size="sm" onClick={vm.testGroqKey} disabled={!vm.groqApiKey}>
									{t('common.test-key')}
								</Button>
							</div>
							{vm.groqKeyStatus === 'success' && <p className="text-[11px] text-green-500">{t('common.groq-test-success')}</p>}
							{vm.groqKeyStatus === 'failed' && <p className="text-[11px] text-destructive">{t('common.groq-test-failed')}</p>}
						</div>
						<Button className="w-full" onClick={vm.startWithGroq} disabled={!vm.groqApiKey || vm.groqKeyStatus !== 'success'}>
							{t('common.get-started', { defaultValue: 'Get started' })}
						</Button>
					</div>
				) : !vm.isDownloading ? (
					<div className="space-y-3">
						<div className="space-y-2">
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
						</div>
						<Button className="w-full" onClick={vm.startDownload}>
							{t('common.model-download')}
						</Button>
						{vm.hasLocalModels && (
							<Button variant="ghost" className="w-full" onClick={vm.goBack}>
								{t('common.back')}
							</Button>
						)}
					</div>
				) : (
					<div className="mt-6 flex flex-col items-center gap-3">
						<div className="text-balance text-2xl font-semibold md:text-3xl">{t('common.downloading-model', { company: vm.modelCompany })}</div>
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
				)}
			</div>

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
