import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Download, FolderOpen, Pencil, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import NumberField from '~/components/number-field'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, IconAction, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'
import { getFriendlyModelName } from '~/lib/model'
import { ModelGlyph } from '~/components/brand-glyph'
import { Progress } from '~/components/ui/progress'
import { catalogNameForFile } from '~/lib/model-catalog'
import { bundledCatalog } from '~/lib/model-catalog-source'
import { useInstallCompleted, useInstallState } from '~/lib/model-install'
import type { NamedPath } from '~/lib/types'

/** The way into the catalog; while a model downloads it doubles as the progress readout. */
function CatalogRow({ onOpen }: { onOpen: () => void }) {
	const { active } = useInstallState()
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-start transition-colors hover:bg-accent/45">
			<div className="min-w-0 flex-1 space-y-0.5">
				<div className="text-sm text-foreground">{m.modelCatalogTitle()}</div>
				{active ? (
					<>
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<span dir="ltr" className="truncate">
								{active.name}
							</span>
							{active.progress != null && (
								<span dir="ltr" className="shrink-0 tabular-nums">
									{Math.round(active.progress)}%
								</span>
							)}
						</div>
						<Progress className="progress-aurora mt-1.5 h-1 bg-muted rtl:-scale-x-100" value={active.progress ?? 0} aria-label={m.downloadingModel()} />
					</>
				) : (
					<p className="line-clamp-1 text-xs text-muted-foreground">{m.modelCatalogHint()}</p>
				)}
			</div>
			<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
		</button>
	)
}

interface ModelsSectionProps {
	vm: SettingsViewModel
	onOpenCatalog: () => void
	/** Set when the catalog's "Add a model…" sent the user back here for the URL field. */
	focusDownload?: boolean
	onDownloadFocused?: () => void
}

export function ModelsSection({ vm, onOpenCatalog, focusDownload, onDownloadFocused }: ModelsSectionProps) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)
	const downloadUrlInput = useRef<HTMLInputElement>(null)
	const displayName = (model: NamedPath) =>
		vm.preference.modelDisplayNames[model.path] ?? catalogNameForFile(bundledCatalog.models, model.name) ?? getFriendlyModelName(model.name)

	useInstallCompleted(() => vm.loadModels())

	useEffect(() => {
		if (!focusDownload) return
		downloadUrlInput.current?.scrollIntoView({ block: 'center' })
		downloadUrlInput.current?.focus({ preventScroll: true })
		onDownloadFocused?.()
	}, [focusDownload])

	const isRenaming = Boolean(currentModel && editingPath === currentModel.path)

	function commitRename() {
		if (!currentModel) return
		const name = editingName.trim()
		if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
		setEditingPath(null)
	}

	function startRename() {
		if (!currentModel) return
		setEditingPath(currentModel.path)
		setEditingName(displayName(currentModel))
	}

	return (
		<div className="space-y-6">
			<SettingsGroup title={m.modelsOnThisComputer()}>
				<SettingsRow label={m.selectModel()}>
					{isRenaming ? (
						<>
							<Input
								autoFocus
								dir="auto"
								value={editingName}
								onChange={(event) => setEditingName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') commitRename()
									if (event.key === 'Escape') setEditingPath(null)
								}}
								className={`w-56 ${rowControlClass}`}
							/>
							<IconAction variant="outline" label={m.save()} icon={<Check className="h-4 w-4" />} onClick={commitRename} />
							<IconAction variant="outline" label={m.cancel()} icon={<X className="h-4 w-4" />} onClick={() => setEditingPath(null)} />
						</>
					) : (
						<>
							<Select
								value={vm.preference.modelPath ?? undefined}
								onValueChange={vm.selectModel}
								onOpenChange={(open) => {
									if (open) vm.loadModels()
								}}>
								<SelectTrigger className={`w-56 ${rowControlClass}`}>
									<SelectValue placeholder={m.selectModel()} />
								</SelectTrigger>
								<SelectContent>
									{vm.models.map((model, index) => (
										<SelectItem key={index} value={model.path}>
											<span className="flex min-w-0 items-center gap-2">
												<ModelGlyph name={model.name} className="shrink-0 text-muted-foreground" />
												{/* Its own direction: a Latin name inside an RTL UI must lose its end to the ellipsis, not its start. */}
												<span dir="auto" className="truncate">
													{displayName(model)}
												</span>
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<IconAction
								variant="outline"
								label={m.showInFolder()}
								icon={<FolderOpen className="h-4 w-4" />}
								disabled={!currentModel}
								onClick={() => currentModel && vm.openSelectedModel(currentModel.path)}
							/>
							<IconAction
								variant="outline"
								label={m.rename()}
								icon={<Pencil className="h-4 w-4" />}
								disabled={!currentModel}
								onClick={startRename}
							/>
						</>
					)}
				</SettingsRow>
				<CatalogRow onOpen={onOpenCatalog} />
			</SettingsGroup>

			<SettingsGroup title={m.settingsHardware()}>
				<SettingsRow label={m.transcribeOnCpu()} description={m.transcribeOnCpuInfo()}>
					<Switch checked={vm.preference.noGpu} onCheckedChange={vm.preference.setNoGpu} aria-label={m.transcribeOnCpu()} />
				</SettingsRow>

				{!vm.isMacOS && !vm.preference.noGpu && (
					<SettingsRow label={m.gpuDevice()}>
						{vm.gpuDevices.length > 0 ? (
							<Select
								value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
								onValueChange={(value) => {
									vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
								}}>
								<SelectTrigger className={`w-56 ${rowControlClass}`}>
									<SelectValue placeholder={m.gpuDevice()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">{m.auto()}</SelectItem>
									{vm.gpuDevices.map((device) => (
										<SelectItem key={device.index} value={String(device.index)}>
											{device.description}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<NumberField
								aria-label={m.gpuDevice()}
								value={vm.preference.gpuDevice ?? -1}
								min={-1}
								max={16}
								// Below zero means "no device pinned" — the placeholder the empty field used to show.
								format={(device) => (device < 0 ? m.auto() : undefined)}
								onChange={(value) => vm.preference.setGpuDevice(value < 0 ? null : value)}
							/>
						)}
					</SettingsRow>
				)}
			</SettingsGroup>

			{vm.corruptModels.length > 0 && (
				<SettingsGroup title={m.modelFileCorrupt()}>
					{vm.corruptModels.map((model) => (
						<SettingsRow
							key={model.path}
							label={<bdi>{getFriendlyModelName(model.name)}</bdi>}
							description={m.modelFileCorruptDescription({ name: model.name })}>
							<IconAction label={m.reDownload()} icon={<Download className="h-4 w-4" />} onClick={() => vm.redownloadModel(model)} />
							<IconAction label={m.showInFolder()} icon={<FolderOpen className="h-4 w-4" />} onClick={() => vm.openSelectedModel(model.path)} />
						</SettingsRow>
					))}
				</SettingsGroup>
			)}

			<SettingsGroup title={m.settingsModelFiles()}>
				<SettingsRow label={m.downloadModel()}>
					<Input
						ref={downloadUrlInput}
						type="text"
						value={vm.downloadURL}
						onChange={(event) => vm.setDownloadURL(event.target.value)}
						placeholder={m.pasteModelLink()}
						onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
						className={`w-56 ${rowControlClass}`}
					/>
					<IconAction label={m.downloadModel()} icon={<Download className="h-4 w-4" />} onClick={vm.downloadModel} disabled={!vm.downloadURL} />
				</SettingsRow>
				<ActionRow label={m.downloadModelsLink()} icon={<LinkIcon className="h-4 w-4" />} onClick={vm.openModelsUrl} />
				<ActionRow label={m.modelsFolder()} icon={<FolderIcon className="h-4 w-4" />} onClick={vm.openModelPath} />
				<ActionRow label={m.changeModelsFolder()} icon={<WrenchIcon className="h-4 w-4" />} onClick={vm.changeModelsFolder} />
			</SettingsGroup>
		</div>
	)
}
