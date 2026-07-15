import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { Input } from '~/components/ui/input'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import { SectionCard, type SettingsViewModel } from './shared'

export function AdvancedSection({ vm }: { vm: SettingsViewModel }) {
	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div className="flex items-center gap-1 px-1">
					<InfoTooltip text={m.ytdlpOptionsInfo()} />
					<span className="text-sm font-semibold text-foreground/95">{m.ytdlpOptions()}</span>
				</div>
				<SectionCard>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="text-sm font-medium">{m.checkYtdlpUpdates()}</span>
						<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
					</div>
				</SectionCard>
			</div>
			<div className="space-y-2">
				<div className="flex items-center gap-1 px-1">
					<InfoTooltip text={`${m.unloadModelAfterInactivityInfo()} ${m.zeroMeansNever()}`} />
					<span className="text-sm font-semibold text-foreground/95">{m.modelMemory()}</span>
				</div>
				<SectionCard>
					<div className="flex items-center justify-between gap-4">
						<span className="text-sm font-medium">{m.unloadModelAfterInactivity()}</span>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={0}
								max={1440}
								step={1}
								value={vm.preference.unloadTimeoutMinutes}
								onChange={(event) => {
									const minutes = Number(event.target.value)
									if (Number.isFinite(minutes)) vm.preference.setUnloadTimeoutMinutes(Math.min(1440, Math.max(0, Math.floor(minutes))))
								}}
								className="h-6 w-20 rounded-lg px-2 py-0 text-right"
							/>
							<span className="text-sm text-muted-foreground">{m.minutes()}</span>
						</div>
					</div>
				</SectionCard>
			</div>
			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={vm.copyLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.copyLogs()} <CopyIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.logsFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealTemp} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.tempFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onClick={vm.askAndReset} className="h-12 w-full justify-between rounded-none px-4 font-medium text-destructive first:rounded-t-2xl last:rounded-b-2xl hover:bg-destructive/12 hover:text-destructive">{m.resetApp()} <ResetIcon className="h-5 w-5" /></Button>
			</div>
		</div>
	)
}
