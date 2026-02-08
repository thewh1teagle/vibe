import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import * as dialogExt from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { usePreferenceProvider } from '~/providers/Preference'
import { InfoTooltip } from './InfoTooltip'
import { Button } from '~/components/ui/button'


import { Switch } from '~/components/ui/switch'
import { Spinner } from '~/components/ui/spinner'

export default function AdvancedTranscribe() {
	const [open, setOpen] = useState(false)
	const { t } = useTranslation()
	const [collecting, setCollecting] = useState(false)
	const navigate = useNavigate()
	const preference = usePreferenceProvider()

	async function selectFolder() {
		const selectedFolder = await dialogExt.open({ multiple: false, directory: true })
		if (!selectedFolder) return

		setCollecting(true)
		const files = await invoke<string[]>('glob_files', {
			folder: selectedFolder,
			patterns: [...config.audioExtensions, ...config.videoExtensions],
			recursive: preference.advancedTranscribeOptions.includeSubFolders,
		})
		setCollecting(false)
		navigate('/batch', { state: { files, outputFolder: selectedFolder } })
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="mt-1 h-9 rounded-md border border-border/65 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/45 hover:text-foreground">
					{t('common.advanced')}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t('common.transcribe-folder')}
						<span className="rounded-full border border-border/65 bg-muted/35 px-2 py-0.5 text-xs font-medium text-primary">(beta)</span>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="flex items-center justify-between rounded-md border border-border/55 bg-card/50 px-3 py-2.5">
						<span className="text-sm font-medium flex items-center gap-1">
							<InfoTooltip text={t('common.include-sub-folders')} />
							{t('common.include-sub-folders')}
						</span>
						<Switch
							checked={preference.advancedTranscribeOptions.includeSubFolders}
							onCheckedChange={(checked) =>
								preference.setAdvancedTranscribeOptions({ ...preference.advancedTranscribeOptions, includeSubFolders: checked })
							}
						/>
					</div>

					<div className="flex items-center justify-between rounded-md border border-border/55 bg-card/50 px-3 py-2.5">
						<span className="text-sm font-medium flex items-center gap-1">
							<InfoTooltip text={t('common.skip-if-transcript-exists')} />
							{t('common.skip-if-transcript-exists')}
						</span>
						<Switch
							checked={preference.advancedTranscribeOptions.skipIfExists}
							onCheckedChange={(checked) =>
								preference.setAdvancedTranscribeOptions({ ...preference.advancedTranscribeOptions, skipIfExists: checked })
							}
						/>
					</div>

					<div className="flex items-center justify-between rounded-md border border-border/55 bg-card/50 px-3 py-2.5">
						<span className="text-sm font-medium flex items-center gap-1">
							<InfoTooltip text={t('common.place-transcript-next-to-files')} />
							{t('common.place-transcript-next-to-files')}
						</span>
						<Switch
							checked={preference.advancedTranscribeOptions.saveNextToAudioFile}
							onCheckedChange={(checked) =>
								preference.setAdvancedTranscribeOptions({ ...preference.advancedTranscribeOptions, saveNextToAudioFile: checked })
							}
						/>
					</div>

					<Button onClick={selectFolder} className="w-full mt-4" disabled={collecting}>
						{collecting && <Spinner className="mr-2" />}
						{t('common.select-folder')}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
