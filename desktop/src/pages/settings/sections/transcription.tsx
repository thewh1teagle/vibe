import * as dialog from '@tauri-apps/plugin-dialog'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { describeAutoExport } from './auto-export'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { deleteAllTranscripts, listTranscripts, notifyTranscriptsChanged, TRANSCRIPTS_CHANGED_EVENT } from '~/lib/transcripts-store'
import { ActionRow, SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

/** Bulk cleanup for the projects folder: one row, one confirmation, everything Vibe saved goes. */
function SavedProjectsGroup({ projectsPath }: { projectsPath: string | null }) {
	const [count, setCount] = useState<number | null>(null)
	const [deleting, setDeleting] = useState(false)

	const refresh = useCallback(() => {
		void listTranscripts(projectsPath).then((entries) => setCount(entries.length))
	}, [projectsPath])

	useEffect(() => {
		refresh()
		// Saves and single-row deletes happen in the main window; both announce themselves.
		window.addEventListener(TRANSCRIPTS_CHANGED_EVENT, refresh)
		return () => window.removeEventListener(TRANSCRIPTS_CHANGED_EVENT, refresh)
	}, [refresh])

	async function deleteAll() {
		if (!count) return
		const confirmed = await dialog.ask(m.deleteAllProjectsBody({ count: String(count) }), { title: m.deleteAllProjects(), kind: 'warning' })
		if (!confirmed) return
		setDeleting(true)
		try {
			const { deleted, failed } = await deleteAllTranscripts(projectsPath)
			// The sidebar in the main window is listening — it drops the rows as soon as this fires.
			notifyTranscriptsChanged()
			refresh()
			toast.success(m.deleteAllProjectsDone({ count: String(deleted) }))
			if (failed) toast.error(m.deleteAllProjectsFailed({ count: String(failed) }))
		} finally {
			setDeleting(false)
		}
	}

	return (
		<SettingsGroup title={m.savedProjects()} description={m.savedProjectsInfo()}>
			<ActionRow
				label={m.deleteAllProjects()}
				description={count ? m.deleteAllProjectsInfo({ count: String(count) }) : m.noProjectsYet()}
				icon={<Trash2 className="h-4 w-4" />}
				onClick={() => void deleteAll()}
				disabled={deleting || !count}
				destructive
				activateOnClick
			/>
		</SettingsGroup>
	)
}

export function TranscriptionSection({ vm, onOpenAutoExport }: { vm: SettingsViewModel; onOpenAutoExport: () => void }) {
	const projectsPath = vm.preference.projectsPath ?? vm.defaultProjectsPath
	const autoExport = vm.preference.autoExport

	return (
		<div className="space-y-6">
			<SettingsGroup>
				{/* LanguageInput lives outside this page; reflow it into a settings row. */}
				<div className="[&>div]:flex [&>div]:min-h-[52px] [&>div]:items-center [&>div]:justify-between [&>div]:gap-4 [&>div]:space-y-0 [&>div]:px-4 [&>div]:py-2.5 [&_label]:text-sm [&_label]:font-normal [&_button]:h-9 [&_button]:w-52 [&_button]:rounded-lg">
					<LanguageInput />
				</div>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label={m.autoExport()} description={autoExport.enabled ? describeAutoExport(autoExport) : m.autoExportInfo()}>
					<div className="flex items-center gap-3">
						<Button variant="outline" size="sm" className="rounded-lg" onClick={onOpenAutoExport}>
							{m.autoExportChange()}
						</Button>
						<Switch checked={autoExport.enabled} onCheckedChange={(enabled) => vm.preference.setAutoExport({ ...autoExport, enabled })} />
					</div>
				</SettingsRow>
				<SettingsRow label={m.playSoundOnFinish()}>
					<Switch checked={vm.preference.soundOnFinish} onCheckedChange={vm.preference.setSoundOnFinish} />
				</SettingsRow>
				<SettingsRow label={m.focusWindowOnFinish()}>
					<Switch checked={vm.preference.focusOnFinish} onCheckedChange={vm.preference.setFocusOnFinish} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.projectsFolder()} description={m.projectsFolderInfo()}>
				<SettingsRow
					label={
						<span title={projectsPath} className="block truncate font-mono text-xs text-muted-foreground">
							{projectsPath}
						</span>
					}>
					{vm.preference.projectsPath && (
						<Button variant="ghost" size="sm" onMouseDown={vm.resetProjectsPath}>
							{m.resetToDefault()}
						</Button>
					)}
					<Button variant="outline" size="sm" onMouseDown={vm.changeProjectsPath}>
						{m.changeProjectsFolder()}
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<SavedProjectsGroup projectsPath={vm.preference.projectsPath} />
		</div>
	)
}
