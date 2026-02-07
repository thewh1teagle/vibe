import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as ChevronDown } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-up.svg'
import * as dialogExt from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { usePreferenceProvider } from '~/providers/Preference'
import { InfoTooltip } from './InfoTooltip'
import { Button } from '~/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
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
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger asChild>
				<button className="pt-2 ps-1.5 flex flex-row items-center gap-0.5 text-xs text-primary font-medium cursor-pointer" type="button">
					{open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
					{t('common.advanced')}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-3 w-full space-y-3">
				<div className="mt-2">
					<span className="text-2xl font-bold">{t('common.transcribe-folder')}</span>
					<span className="text-primary text-sm ms-2">(beta)</span>
				</div>

				<div className="flex items-center justify-between">
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

				<div className="flex items-center justify-between">
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

				<div className="flex items-center justify-between">
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

				<Button onClick={selectFolder} className="w-full mt-2" disabled={collecting}>
					{collecting && <Spinner className="mr-2" />}
					{t('common.select-folder')}
				</Button>
			</CollapsibleContent>
		</Collapsible>
	)
}
