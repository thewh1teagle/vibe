import { useContext } from 'react'
import { m } from '~/paraglide/messages.js'
import { UpdaterContext, devToolsEnabled } from '~/providers/updater'
import { Switch } from '~/components/ui/switch'
import NumberField from '~/components/number-field'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import type { CpuVariant } from '~/providers/preference'
import { ActionRow, SettingsGroup, SettingsRow, rowControlClass, type SettingsViewModel } from './shared'

export function AdvancedSection({ vm }: { vm: SettingsViewModel }) {
	const { fakeUpdate, setFakeUpdate } = useContext(UpdaterContext)
	const cpuVariants: Array<{ value: CpuVariant; label: string }> = [
		{ value: 'auto', label: m.cpuVariantAuto() },
		{ value: 'avx2', label: m.cpuVariantAvx2() },
		{ value: 'baseline', label: m.cpuVariantBaseline() },
	]

	return (
		<div className="space-y-6">
			{/* Dev builds only: flips the update affordances on without waiting for a real release. */}
			{devToolsEnabled && (
				<SettingsGroup title={m.developer()}>
					<SettingsRow label={m.fakeUpdateAvailable()} description={m.fakeUpdateAvailableInfo()}>
						<Switch checked={fakeUpdate} onCheckedChange={setFakeUpdate} />
					</SettingsRow>
				</SettingsGroup>
			)}
			<SettingsGroup>
				<SettingsRow label={m.checkYtdlpUpdates()} description={m.ytdlpOptionsInfo()}>
					<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
				</SettingsRow>
				<SettingsRow label={m.unloadModelAfterInactivity()} description={`${m.unloadModelAfterInactivityInfo()} ${m.zeroMeansNever()}`}>
					<NumberField
						aria-label={m.unloadModelAfterInactivity()}
						value={vm.preference.unloadTimeoutMinutes}
						min={0}
						max={1440}
						step={5}
						suffix={m.minutes()}
						format={(minutes) => (minutes === 0 ? m.never() : undefined)}
						onChange={vm.preference.setUnloadTimeoutMinutes}
					/>
				</SettingsRow>
				<SettingsRow label={m.cpuVariant()} description={m.cpuVariantInfo()}>
					<Select value={vm.preference.cpuVariant} onValueChange={(value: CpuVariant) => vm.preference.setCpuVariant(value)}>
						<SelectTrigger className={`w-44 ${rowControlClass}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{cpuVariants.map((choice) => (
								<SelectItem key={choice.value} value={choice.value}>
									{choice.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.settingsTroubleshooting()}>
				<ActionRow label={m.copyLogs()} icon={<CopyIcon className="h-4 w-4" />} onClick={vm.copyLogs} />
				<ActionRow label={m.logsFolder()} icon={<FolderIcon className="h-4 w-4" />} onClick={vm.revealLogs} />
				<ActionRow label={m.tempFolder()} icon={<FolderIcon className="h-4 w-4" />} onClick={vm.revealTemp} />
			</SettingsGroup>

			<SettingsGroup>
				<ActionRow label={m.resetApp()} icon={<ResetIcon className="h-4 w-4" />} onClick={vm.askAndReset} destructive activateOnClick />
			</SettingsGroup>
		</div>
	)
}
