import * as dialogPlugin from '@tauri-apps/plugin-dialog'
import { m } from '~/paraglide/messages.js'
import { Switch } from '~/components/ui/switch'
import { formatExtensions, type TextFormat } from '~/components/format-select'
import type { AutoExportDestination, AutoExportSettings } from '~/lib/auto-export'
import { projectExportFilename } from '~/lib/project-name'
import { cn } from '~/lib/style'
import { SettingsGroup, SettingsRow, type SettingsViewModel } from './shared'

const formatChoices: Array<{ value: TextFormat; label: string }> = [
	{ value: 'vtt', label: 'VTT' },
	{ value: 'srt', label: 'SRT' },
	{ value: 'normal', label: 'TXT' },
	{ value: 'md', label: 'MD' },
	{ value: 'json', label: 'JSON' },
	{ value: 'csv', label: 'CSV' },
	{ value: 'docx', label: 'DOCX' },
	{ value: 'pdf', label: 'PDF' },
	{ value: 'html', label: 'HTML' },
]

/** "VTT, SRT · Next to each recording", for the row in Transcription and the Export menu. */
export function describeAutoExport(settings: AutoExportSettings) {
	const formats = settings.formats.map((format) => formatExtensions[format].slice(1).toUpperCase()).join(', ')
	const where =
		settings.destination === 'beside'
			? m.autoExportBeside()
			: settings.destination === 'projects'
				? m.autoExportProjects()
				: (settings.folder ?? m.autoExportFolder())
	return m.autoExportSummaryLine({ formats, where })
}

/**
 * The Auto-export page inside Settings: on/off, formats, destination, the replace rule,
 * and the two content switches it shares with a single export. Every change applies at
 * once, like the rest of Settings; there is nothing to save.
 */
export function AutoExportSection({ vm }: { vm: SettingsViewModel }) {
	const settings = vm.preference.autoExport
	const update = (patch: Partial<AutoExportSettings>) => vm.preference.setAutoExport({ ...settings, ...patch })
	const exportOptions = vm.preference.exportOptions
	const updateExport = (patch: Partial<typeof exportOptions>) => vm.preference.setExportOptions({ ...exportOptions, ...patch })

	const source = 'interview.mp4'
	const target = projectExportFilename(source, formatExtensions[settings.formats[0] ?? 'vtt'].slice(1))

	function toggleFormat(format: TextFormat) {
		const next = settings.formats.includes(format) ? settings.formats.filter((f) => f !== format) : [...settings.formats, format]
		if (next.length > 0) update({ formats: next })
	}

	async function chooseFolder() {
		const picked = await dialogPlugin.open({ multiple: false, directory: true })
		if (picked && !Array.isArray(picked)) update({ destination: 'folder', folder: picked })
	}

	const destinations: Array<{ value: AutoExportDestination; label: string; info: string }> = [
		{ value: 'beside', label: m.autoExportBeside(), info: m.autoExportBesideExample({ source, target }) },
		{ value: 'projects', label: m.autoExportProjects(), info: m.autoExportProjectsInfo() },
		{ value: 'folder', label: m.autoExportFolder(), info: settings.folder ?? m.autoExportNoFolderYet() },
	]

	return (
		<div className="space-y-6">
			<SettingsGroup description={m.autoExportInfo()}>
				<SettingsRow label={m.autoExport()}>
					<Switch checked={settings.enabled} onCheckedChange={(enabled) => update({ enabled })} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.autoExportFormats()}>
				<div className="flex flex-wrap gap-1.5 px-4 py-3">
					{formatChoices.map((choice) => {
						const selected = settings.formats.includes(choice.value)
						return (
							<button
								key={choice.value}
								type="button"
								onClick={() => toggleFormat(choice.value)}
								aria-pressed={selected}
								className={cn(
									'cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors',
									selected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-muted text-muted-foreground hover:text-foreground',
								)}>
								{choice.label}
							</button>
						)
					})}
				</div>
			</SettingsGroup>

			<SettingsGroup title={m.autoExportWhere()}>
				<div className="space-y-2.5 px-4 py-3">
					{destinations.map((choice) => (
						<label key={choice.value} className="flex cursor-pointer items-start gap-2.5">
							<input
								type="radio"
								name="auto-export-destination"
								className="mt-1 accent-primary"
								checked={settings.destination === choice.value}
								onChange={() => update({ destination: choice.value })}
							/>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-2 text-sm text-foreground">
									{choice.label}
									{choice.value === 'folder' && (
										<button
											type="button"
											onClick={() => void chooseFolder()}
											className="cursor-pointer text-[12px] text-primary underline-offset-4 hover:underline">
											{m.autoExportChooseFolder()}
										</button>
									)}
								</span>
								<span className="block truncate text-[11px] text-muted-foreground" title={choice.info}>
									{choice.info}
								</span>
							</span>
						</label>
					))}
				</div>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow label={m.autoExportReplace()} description={m.autoExportReplaceInfo()}>
					<Switch checked={settings.replace} onCheckedChange={(replace) => update({ replace })} />
				</SettingsRow>
				<SettingsRow label={m.showTimestamps()}>
					<Switch checked={exportOptions.showTimestamps} onCheckedChange={(showTimestamps) => updateExport({ showTimestamps })} />
				</SettingsRow>
				<SettingsRow label={m.showSpeakers()}>
					<Switch checked={exportOptions.showSpeakers} onCheckedChange={(showSpeakers) => updateExport({ showSpeakers })} />
				</SettingsRow>
			</SettingsGroup>
		</div>
	)
}
