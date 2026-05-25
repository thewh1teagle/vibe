import { useTranslation } from 'react-i18next'
import Layout from '~/components/layout'
import ModelOptions from '~/components/params'
import { viewModel } from './view-model'
import AudioDeviceInput from '~/components/audio-device-input'
import { useEffect } from 'react'
import { webviewWindow } from '@tauri-apps/api'
import * as keepAwake from 'tauri-plugin-keepawake-api'
import { Button } from '~/components/ui/button'
import DictationDialog from '~/components/dictation-dialog'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import AudioVisualizer from './audio-visualizer'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()

	async function showWindow() {
		const currentWindow = webviewWindow.getCurrentWebviewWindow()
		await currentWindow.show()
		if (import.meta.env.PROD) await currentWindow.setFocus()
	}

	useEffect(() => {
		showWindow()
	}, [])

	return (
		<Layout>
			<div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
				<div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col items-center gap-5">
					<div className="w-full min-w-0 space-y-4">
						<AudioDeviceInput device={vm.inputDevice} setDevice={vm.setInputDevice} devices={vm.devices} type="input" />
						<AudioDeviceInput device={vm.outputDevice} setDevice={vm.setOutputDevice} devices={vm.devices} type="output" />
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/45 px-3 py-2.5">
							<span className="text-sm font-medium">{t('common.save-record-in-documents-folder')}</span>
							<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
						</div>

						{!vm.isRecording ? (
							<Button onMouseDown={() => vm.startRecord()} className="mt-1 w-full" disabled={!vm.preference.modelPath || (!vm.inputDevice && !vm.outputDevice)}>
								{t('common.start-record')}
							</Button>
						) : (
							<Button
								onMouseDown={() => {
									keepAwake.stop()
									vm.stopRecord()
								}}
								className="mt-1 w-full bg-success text-success-foreground hover:bg-success/90">
								<Spinner className="mr-2" />
								{t('common.stop-and-transcribe')}
							</Button>
						)}

						{!vm.preference.modelPath && (
							<p className="text-center text-sm text-muted-foreground">{t('common.no-model-selected')}</p>
						)}

						{vm.inputDevice && <AudioVisualizer isRecording={vm.isRecording} inputDevice={vm.inputDevice} />}

						<DictationDialog />

						<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
					</div>
				</div>
			</div>
		</Layout>
	)
}
