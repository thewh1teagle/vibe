import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import { SectionCard, type SettingsViewModel } from './shared'

export function AdvancedSection({ vm }: { vm: SettingsViewModel }) {
	const { t } = useTranslation()
	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div className="flex items-center gap-1 px-1">
					<InfoTooltip text={t('common.ytdlp-options-info')} />
					<span className="text-sm font-semibold text-foreground/95">{t('common.ytdlp-options')}</span>
				</div>
				<SectionCard>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="text-sm font-medium">{t('common.check-ytdlp-updates')}</span>
						<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
					</div>
				</SectionCard>
			</div>
			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={vm.copyLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{t('common.copy-logs')} <CopyIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{t('common.logs-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealTemp} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{t('common.temp-folder')} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onClick={vm.askAndReset} className="h-12 w-full justify-between rounded-none px-4 font-medium text-destructive first:rounded-t-2xl last:rounded-b-2xl hover:bg-destructive/12 hover:text-destructive">{t('common.reset-app')} <ResetIcon className="h-5 w-5" /></Button>
			</div>
		</div>
	)
}
