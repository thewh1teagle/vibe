import { useState } from 'react'
import { FolderOpen, PencilLine } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { SectionCard, type SettingsViewModel } from './shared'
import { getFriendlyModelName } from '~/lib/model'

export function ModelsSection({ vm }: { vm: SettingsViewModel }) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)

	return (
<div className="space-y-5">
							<SectionCard>
								<div className="space-y-5">
									<div className="space-y-2">
										<Label>{m.downloadModel()}</Label>
										<div className="flex items-center gap-2">
											<Input
												type="text"
												value={vm.downloadURL}
												onChange={(event) => vm.setDownloadURL(event.target.value)}
												placeholder={m.pasteModelLink()}
												onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
											/>
											<Button variant="default" size="icon" onClick={vm.downloadModel} className="shrink-0">
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
										<Label>{m.selectModel()}</Label>
										<Select
											value={vm.preference.modelPath ?? undefined}
											onValueChange={(value) => vm.preference.setModelPath(value)}
											onOpenChange={(open) => {
												if (open) vm.loadModels()
											}}>
											<SelectTrigger>
												<SelectValue placeholder={m.selectModel()} />
											</SelectTrigger>
											<SelectContent>
														{vm.models.map((model, index) => (
															<SelectItem key={index} value={model.path}>
																{vm.preference.modelDisplayNames[model.path] ?? getFriendlyModelName(model.name)}
															</SelectItem>
												))}
											</SelectContent>
											</Select>
							{currentModel && (editingPath === currentModel.path ? (
								<div className="flex items-center gap-2">
									<Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => {
										if (event.key === 'Enter') {
											const name = editingName.trim()
											if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
											setEditingPath(null)
										}
										if (event.key === 'Escape') setEditingPath(null)
									}} />
									<Button size="sm" onClick={() => {
										const name = editingName.trim()
										if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
										setEditingPath(null)
									}}>{m.save()}</Button>
									<Button variant="ghost" size="sm" onClick={() => setEditingPath(null)}>{m.cancel()}</Button>
								</div>
							) : (
								<div className="mt-2 flex items-center justify-end gap-1 px-1">
									<Button variant="ghost" size="xs" className="px-2.5 text-muted-foreground hover:text-foreground" onClick={() => vm.openSelectedModel(currentModel.path)}>
										<FolderOpen className="size-3.5" /> {m.showInFolder()}
									</Button>
									<Button variant="ghost" size="xs" className="px-2.5 text-muted-foreground hover:text-foreground" onClick={() => { setEditingPath(currentModel.path); setEditingName(vm.preference.modelDisplayNames[currentModel.path] ?? getFriendlyModelName(currentModel.name)) }}>
										<PencilLine className="size-3.5" /> {m.rename()}
									</Button>
								</div>
							))}
									</div>

									{!vm.isMacOS && (
										<div className="space-y-2">
											<Label>{m.gpuDevice()}</Label>
											{vm.gpuDevices.length > 0 ? (
												<Select
													value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
													onValueChange={(value) => {
														vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
													}}>
													<SelectTrigger>
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
												<Input
													type="number"
													value={vm.preference.gpuDevice ?? ''}
													onChange={(e) => {
														const val = e.target.value
														vm.preference.setGpuDevice(val === '' ? null : parseInt(val, 10))
													}}
													placeholder={m.gpuDevicePlaceholder()}
												/>
											)}
										</div>
									)}

									<div className="space-y-1 pt-1">
										<Button
											variant="ghost"
											onMouseDown={vm.openModelsUrl}
											className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
											{m.downloadModelsLink()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
										</Button>
										<Button
											variant="ghost"
											onMouseDown={vm.openModelPath}
											className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
											{m.modelsFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" />
										</Button>
										<Button
											variant="ghost"
											onMouseDown={vm.changeModelsFolder}
											className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
											{m.changeModelsFolder()} <WrenchIcon className="h-4 w-4 text-muted-foreground" />
										</Button>
									</div>
								</div>
							</SectionCard>

						</div>
	)
}
