import { openUrl } from '@tauri-apps/plugin-opener'
import { Bot } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { Button } from '~/components/ui/button'
import { SectionCard, type SettingsViewModel } from './shared'

export function ApiSection({ vm }: { vm: SettingsViewModel }) {
	const apiDocsUrl = vm.apiBaseUrl ? `${vm.apiBaseUrl}/docs` : null
	const serverActionBusy = vm.isStartingApiServer || vm.isStoppingApiServer
	return (
<div className="space-y-5">
							<p className="px-1 text-sm text-muted-foreground">{m.apiAgentsDescription()}</p>
							<SectionCard>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2.5">
										<span
											className={`h-2 w-2 rounded-full ${vm.apiBaseUrl ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]' : 'bg-muted-foreground/40 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]'}`}
										/>
										<div>
											<p className="text-sm font-semibold">{vm.apiBaseUrl ? m.apiServerRunning() : m.apiServerOff()}</p>
											{vm.apiBaseUrl && <p className="text-xs text-muted-foreground">{vm.apiBaseUrl}</p>}
										</div>
									</div>
									<Button
										variant={vm.apiBaseUrl ? 'outline' : 'default'}
										size="sm"
										className="rounded-lg"
										onMouseDown={vm.apiBaseUrl ? vm.stopApiServer : vm.startApiServer}
										disabled={serverActionBusy}>
										{vm.isStartingApiServer
											? m.apiStarting()
											: vm.isStoppingApiServer
												? m.apiStopping()
												: vm.apiBaseUrl
													? m.stop()
													: m.start()}
									</Button>
								</div>
							</SectionCard>

							<div className={`divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs ${!vm.apiBaseUrl ? 'pointer-events-none opacity-50' : ''}`}>
								<Button
									variant="ghost"
									onMouseDown={() => (apiDocsUrl ? openUrl(apiDocsUrl) : null)}
									disabled={!apiDocsUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{m.swaggerDocs()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.copyCurlExample}
									disabled={!vm.apiBaseUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{m.copyCurlExample()} <CopyIcon className="h-4 w-4 text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									onMouseDown={vm.copyAgentSkill}
									disabled={!vm.apiBaseUrl}
									className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
									{m.copyAgentSkill()} <Bot className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</div>
	)
}
