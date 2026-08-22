import { useState } from 'react'
import { Check, Download, FolderOpen, PencilLine, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import NumberField from '~/components/number-field'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { ActionRow, IconAction, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'
import { getFriendlyModelName } from '~/lib/model'
import { ModelGlyph } from '~/components/brand-glyph'

export function ModelsSection({ vm }: { vm: SettingsViewModel }) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)
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
		setEditingName(vm.preference.modelDisplayNames[currentModel.path] ?? getFriendlyModelName(currentModel.name))
	}

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow label={m.selectModel()}>
					{isRenaming ? (
						<>
							<Input
								autoFocus
								value={editingName}
								onChange={(event) => setEditingName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') commitRename()
									if (event.key === 'Escape') setEditingPath(null)
								}}
								className={`w-56 ${rowControlClass}`}
							/>
							<IconAction label={m.save()} icon={<Check className="h-4 w-4" />} onClick={commitRename} />
							<IconAction label={m.cancel()} icon={<X className="h-4 w-4" />} onClick={() => setEditingPath(null)} />
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
											<span className="flex items-center gap-2">
												<ModelGlyph name={model.name} className="text-muted-foreground" />
												{vm.preference.modelDisplayNames[model.path] ?? getFriendlyModelName(model.name)}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<IconAction
								label={m.showInFolder()}
								icon={<FolderOpen className="h-4 w-4" />}
								disabled={!currentModel}
								onClick={() => currentModel && vm.openSelectedModel(currentModel.path)}
							/>
							<IconAction label={m.rename()} icon={<PencilLine className="h-4 w-4" />} disabled={!currentModel} onClick={startRename} />
						</>
					)}
				</SettingsRow>

				{!vm.isMacOS && (
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

				<SettingsRow label={m.downloadModel()}>
					<Input
						type="text"
						value={vm.downloadURL}
						onChange={(event) => vm.setDownloadURL(event.target.value)}
						placeholder={m.pasteModelLink()}
						onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
						className={`w-56 ${rowControlClass}`}
					/>
					<IconAction label={m.downloadModel()} icon={<Download className="h-4 w-4" />} onClick={vm.downloadModel} disabled={!vm.downloadURL} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup>
				<ActionRow label={m.downloadModelsLink()} icon={<LinkIcon className="h-4 w-4" />} onClick={vm.openModelsUrl} />
				<ActionRow label={m.modelsFolder()} icon={<FolderIcon className="h-4 w-4" />} onClick={vm.openModelPath} />
				<ActionRow label={m.changeModelsFolder()} icon={<WrenchIcon className="h-4 w-4" />} onClick={vm.changeModelsFolder} />
			</SettingsGroup>
		</div>
	)
}
