import { useTranslation } from 'react-i18next'
import LanguageInput from '~/components/LanguageInput'
import Layout from '~/components/Layout'
import ModelOptions from '~/components/Params'
import TextArea from '~/components/TextArea'
import AudioInput from '~/pages/home/AudioInput'
import AudioPlayer from './AudioPlayer'
import ProgressPanel from './ProgressPanel'
import { viewModel } from './viewModel'
import AudioDeviceInput from '~/components/AudioDeviceInput'
import { ReactComponent as FileIcon } from '~/icons/file.svg'
import { ReactComponent as MicrphoneIcon } from '~/icons/microphone.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { useEffect } from 'react'
import { webviewWindow } from '@tauri-apps/api'
import * as keepAwake from 'tauri-plugin-keepawake-api'
import AdvancedTranscribe from '~/components/AdvancedTranscribe'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'

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
			<Tabs
				value={String(vm.preference.homeTabIndex)}
				onValueChange={(v) => (v === '2' ? vm.switchToLinkTab() : vm.preference.setHomeTabIndex(Number(v)))}
				className="flex flex-col items-center">
				<TabsList className="mt-5">
					<TabsTrigger value="0">
						<MicrphoneIcon className="w-[18px] h-[18px]" />
					</TabsTrigger>
					<TabsTrigger value="1">
						<FileIcon className="w-[18px] h-[18px]" />
					</TabsTrigger>
					<TabsTrigger value="2">
						<LinkIcon className="w-[18px] h-[18px]" />
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{vm.preference.homeTabIndex === 0 && (
				<div className="flex w-[300px] flex-col m-auto">
					<AudioDeviceInput device={vm.inputDevice} setDevice={vm.setInputDevice} devices={vm.devices} type="input" />
					<AudioDeviceInput device={vm.outputDevice} setDevice={vm.setOutputDevice} devices={vm.devices} type="output" />
					<div className="flex items-center justify-between mt-2 mb-5">
						<span className="text-sm font-medium">{t('common.save-record-in-documents-folder')}</span>
						<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
					</div>

					{!vm.isRecording && (
						<Button onMouseDown={() => vm.startRecord()} className="mt-3">
							{t('common.start-record')}
						</Button>
					)}

					{vm.isRecording && (
						<Button
							onMouseDown={() => {
								keepAwake.stop()
								vm.stopRecord()
							}}
							className="mt-3 bg-success hover:bg-success/90 text-success-foreground">
							<Spinner className="mr-2" />
							{t('common.stop-and-transcribe')}
						</Button>
					)}

					<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
				</div>
			)}

			{vm.preference.homeTabIndex === 1 && (
				<>
					<div className="flex w-[300px] flex-col m-auto">
						<div className="flex flex-col gap-2">
							<LanguageInput />
							{!vm.files.length && <AudioInput onClick={vm.selectFiles} />}
							<AdvancedTranscribe />
						</div>
						{vm.audio && (
							<div>
								{vm.files.length ? <AudioPlayer label={vm.files[0].name} onLabelClick={() => vm.openPath(vm.files[0])} audio={vm.audio} /> : null}
								{!vm.loading && (
									<Button variant="link" onMouseDown={vm.selectFiles} className="text-xs px-0 mb-3 mt-1">
										{t('common.change-file')}
									</Button>
								)}
							</div>
						)}
						{vm.audio && !vm.loading && (
							<>
								<Button onMouseDown={() => vm.transcribe(vm.files[0].path)} className="mt-3">
									{t('common.transcribe')}
								</Button>
								<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
							</>
						)}
					</div>
					<div className="h-20" />
					{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}

					{vm.summarizeSegments && (
						<Tabs value={vm.transcriptTab} onValueChange={(v) => vm.setTranscriptTab(v as 'transcript' | 'summary')} className="flex flex-col items-center">
							<TabsList className="self-center">
								<TabsTrigger value="transcript">{t('common.segments-tab')}</TabsTrigger>
								<TabsTrigger value="summary">{t('common.summary-tab')}</TabsTrigger>
							</TabsList>
						</Tabs>
					)}

					{(vm.segments || vm.loading) && (
						<div className="flex flex-col mt-5 items-center w-[90%] max-w-[1000px] h-[84vh] m-auto">
							<TextArea
								setSegments={vm.transcriptTab === 'transcript' ? vm.setSegments : vm.setSummarizeSegments}
								file={vm.files[0]}
								placeholder={t('common.transcript-will-displayed-shortly')}
								segments={vm.transcriptTab === 'transcript' ? vm.segments : vm.summarizeSegments}
								readonly={vm.loading}
							/>
						</div>
					)}
				</>
			)}

			{vm.preference.homeTabIndex === 2 && (
				<div className="flex w-[300px] flex-col m-auto">
					<div className="flex flex-col gap-0 mt-5">
						<Input
							type="text"
							value={vm.audioUrl}
							onChange={(event) => vm.setAudioUrl(event.target.value)}
							placeholder="https://www.youtube.com/watch?v=aj8-ABRl1Jo"
							onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadAudio() : null)}
						/>

						{vm.downloadingAudio ? (
							<div className="w-full flex flex-col items-center mt-5">
								<div className="flex flex-row items-center text-center gap-3 bg-muted p-4 rounded-2xl">
									<Spinner className="text-primary" />
									<p>{t('common.downloading', { progress: vm.ytdlpProgress })}</p>
									<Button variant="ghost" size="sm" onClick={() => vm.cancelYtDlpDownload()} className="text-destructive hover:text-destructive/80">
										{t('common.cancel')}
									</Button>
								</div>
							</div>
						) : (
							<>
								<div className="flex items-center justify-between mt-2 mb-5">
									<span className="text-sm font-medium">{t('common.save-record-in-documents-folder')}</span>
									<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
								</div>
								<Button onMouseDown={vm.downloadAudio}>{t('common.download-file')}</Button>
								<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
							</>
						)}
					</div>
				</div>
			)}
		</Layout>
	)
}
