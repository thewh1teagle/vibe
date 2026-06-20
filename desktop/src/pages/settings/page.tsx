import { useTranslation } from 'react-i18next'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

export default function SettingsPage() {
	const { t } = useTranslation()
	const vm = viewModel()

	return (
		<div>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label>{t('common.provider')}</Label>
					<div className="flex gap-1.5">
						{(['local', 'groq'] as const).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => vm.preference.setTranscriptionProvider(p)}
								className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
									vm.preference.transcriptionProvider === p
										? 'border-primary/40 bg-primary/8 text-primary shadow-sm'
										: 'border-border/50 bg-background/30 text-muted-foreground hover:bg-accent/30 hover:text-foreground'
								}`}>
								{t(`common.provider-${p}`)}
							</button>
						))}
					</div>
				</div>

				{vm.preference.transcriptionProvider === 'groq' ? (
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
								value={vm.preference.groqApiKey}
								onChange={(e) => vm.preference.setGroqApiKey(e.target.value)}
								placeholder={t('common.groq-api-key-placeholder')}
								className="flex-1"
							/>
							<Button variant="outline" size="sm" onClick={vm.testGroqKey} disabled={!vm.preference.groqApiKey}>
								{t('common.test-key')}
							</Button>
						</div>
						{vm.groqKeyStatus === 'success' && <p className="text-[11px] text-green-500">{t('common.groq-test-success')}</p>}
						{vm.groqKeyStatus === 'failed' && <p className="text-[11px] text-destructive">{t('common.groq-test-failed')}</p>}
					</div>
				) : (
					<>
						<div className="space-y-2">
							<Label>{t('common.download-model')}</Label>
							<div className="flex items-center gap-2">
								<Select onValueChange={vm.selectPresetForDownload}>
									<SelectTrigger className="flex-1">
										<SelectValue placeholder={t('common.select-model')} />
									</SelectTrigger>
									<SelectContent>
										{vm.presets.map((preset) => (
											<SelectItem key={preset.id} value={preset.id}>
												{t(preset.nameKey)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button variant="default" size="icon" onClick={vm.openModelsUrl} className="shrink-0">
									<svg
										aria-hidden="true"
										focusable="false"
										role="img"
										className="octicon octicon-download"
										viewBox="0 0 16 16"
										width="16"
										height="16"
										fill="currentColor">
										<path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
										<path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
									</svg>
								</Button>
							</div>
						</div>

						<div className="space-y-2">
							<Label>{t('common.select-model')}</Label>
							<Select
								value={vm.preference.modelPath ?? undefined}
								onValueChange={(value) => vm.preference.setModelPath(value)}
								onOpenChange={(open) => {
									if (open) vm.loadModels()
								}}>
								<SelectTrigger>
									<SelectValue placeholder={t('common.select-model')} />
								</SelectTrigger>
								<SelectContent>
									{vm.models.map((model) => (
										<SelectItem key={model.path} value={model.path}>
											{model.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{!vm.isMacOS && (
							<div className="space-y-2">
								<Label>{t('common.gpu-device')}</Label>
								{vm.gpuDevices.length > 0 ? (
									<Select
										value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
										onValueChange={(value) => {
											vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
										}}>
										<SelectTrigger>
											<SelectValue placeholder={t('common.gpu-device')} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="auto">Auto</SelectItem>
											{vm.gpuDevices.map((device) => (
												<SelectItem key={device.index} value={String(device.index)}>
													{device.description}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Input
										type="number"
										value={vm.preference.gpuDevice ?? ''}
										onChange={(e) => {
											const val = e.target.value
											vm.preference.setGpuDevice(val === '' ? null : parseInt(val, 10))
										}}
										placeholder={t('common.gpu-device-placeholder')}
									/>
								)}
							</div>
						)}

						<div className="space-y-1 pt-1">
							<Button
								variant="ghost"
								onClick={vm.openModelsUrl}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{t('common.download-models-link')} <LinkIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								onClick={vm.openModelPath}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{t('common.models-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								onClick={vm.changeModelsFolder}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{t('common.change-models-folder')} <WrenchIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
