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
			<div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
				<div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center gap-5">
					<Tabs
						value={String(vm.preference.homeTabIndex)}
						onValueChange={(v) => (v === '2' ? vm.switchToLinkTab() : vm.preference.setHomeTabIndex(Number(v)))}
						className="flex flex-col items-center">
						<TabsList className="h-11 rounded-md border border-border/65 bg-card/55 p-1 shadow-xs">
							<TabsTrigger value="0" className="h-8 min-w-12 rounded-sm data-[state=active]:shadow-none data-[state=active]:bg-background/85">
								<MicrphoneIcon className="h-[18px] w-[18px]" />
							</TabsTrigger>
							<TabsTrigger value="1" className="h-8 min-w-12 rounded-sm data-[state=active]:shadow-none data-[state=active]:bg-background/85">
								<FileIcon className="h-[18px] w-[18px]" />
							</TabsTrigger>
							<TabsTrigger value="2" className="h-8 min-w-12 rounded-sm data-[state=active]:shadow-none data-[state=active]:bg-background/85">
								<LinkIcon className="h-[18px] w-[18px]" />
							</TabsTrigger>
						</TabsList>
					</Tabs>

					{vm.preference.homeTabIndex === 0 && (
						<div className="w-full min-w-0 max-w-2xl space-y-4">
							<AudioDeviceInput device={vm.inputDevice} setDevice={vm.setInputDevice} devices={vm.devices} type="input" />
							<AudioDeviceInput device={vm.outputDevice} setDevice={vm.setOutputDevice} devices={vm.devices} type="output" />
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/45 px-3 py-2.5">
								<span className="text-sm font-medium">{t('common.save-record-in-documents-folder')}</span>
								<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
							</div>

							{!vm.isRecording ? (
								<Button onMouseDown={() => vm.startRecord()} className="mt-1 w-full">
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

							<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
						</div>
					)}

					{vm.preference.homeTabIndex === 1 && (
						<div className="w-full min-w-0 max-w-3xl space-y-4">
							<div className="space-y-3">
								<LanguageInput />
								{!vm.files.length && !vm.selectedFolder && <AudioInput onClick={vm.selectFiles} onSelectFolder={vm.selectFolder} />}

								{vm.selectedFolder && (
									<div className="space-y-3 rounded-lg border border-border/70 bg-card/70 p-3">
										<div className="text-xs text-muted-foreground">{vm.selectedFolder}</div>
										<div className="text-sm font-medium">
											{t('common.files')}: {vm.files.length}
										</div>
										<div className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 px-3 py-2">
											<span className="text-sm">{t('common.include-sub-folders')}</span>
											<Switch
												checked={vm.preference.advancedTranscribeOptions.includeSubFolders}
												onCheckedChange={(checked) =>
													vm.preference.setAdvancedTranscribeOptions({ ...vm.preference.advancedTranscribeOptions, includeSubFolders: checked })
												}
											/>
										</div>
										<div className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 px-3 py-2">
											<span className="text-sm">{t('common.skip-if-transcript-exists')}</span>
											<Switch
												checked={vm.preference.advancedTranscribeOptions.skipIfExists}
												onCheckedChange={(checked) =>
													vm.preference.setAdvancedTranscribeOptions({ ...vm.preference.advancedTranscribeOptions, skipIfExists: checked })
												}
											/>
										</div>
										<div className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 px-3 py-2">
											<span className="text-sm">{t('common.place-transcript-next-to-files')}</span>
											<Switch
												checked={vm.preference.advancedTranscribeOptions.saveNextToAudioFile}
												onCheckedChange={(checked) =>
													vm.preference.setAdvancedTranscribeOptions({
														...vm.preference.advancedTranscribeOptions,
														saveNextToAudioFile: checked,
													})
												}
											/>
										</div>

										<div className="flex items-center gap-3">
											<Button onMouseDown={vm.startFolderBatch} className="flex-1" disabled={vm.isCollectingFolder || vm.files.length === 0}>
												{vm.isCollectingFolder && <Spinner className="mr-2" />}
												{t('common.transcribe-folder')}
											</Button>
											<Button variant="ghost" onMouseDown={vm.clearFolderSelection}>
												{t('common.change-file')}
											</Button>
										</div>
									</div>
								)}
							</div>
							{vm.audio && (
								<div>
									{vm.files.length ? <AudioPlayer label={vm.files[0].name} onLabelClick={() => vm.openPath(vm.files[0])} audio={vm.audio} /> : null}
									{!vm.loading && (
										<Button variant="link" onMouseDown={vm.selectFiles} className="mb-2 mt-1 px-0 text-xs">
											{t('common.change-file')}
										</Button>
									)}
								</div>
							)}
							{vm.audio && !vm.loading && (
								<>
									<Button onMouseDown={() => vm.transcribe(vm.files[0].path)} className="mt-1 w-full">
										{t('common.transcribe')}
									</Button>
									<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
								</>
							)}
							{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}
						</div>
					)}

					{vm.preference.homeTabIndex === 2 && (
						<div className="w-full min-w-0 max-w-2xl space-y-4">
							<Input
								type="text"
								value={vm.audioUrl}
								onChange={(event) => vm.setAudioUrl(event.target.value)}
								placeholder="https://www.youtube.com/watch?v=aj8-ABRl1Jo"
								onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadAudio() : null)}
							/>

							{vm.downloadingAudio ? (
								<div className="flex flex-wrap items-center justify-center gap-3 rounded-md border border-border/60 bg-card/45 px-3 py-2.5">
									<Spinner className="text-primary" />
									<p>{t('common.downloading', { progress: vm.ytdlpProgress })}</p>
									<Button variant="ghost" size="sm" onClick={() => vm.cancelYtDlpDownload()} className="text-destructive hover:text-destructive/80">
										{t('common.cancel')}
									</Button>
								</div>
							) : (
								<>
									<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/45 px-3 py-2.5">
										<span className="text-sm font-medium">{t('common.save-record-in-documents-folder')}</span>
										<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
									</div>
									<Button onMouseDown={vm.downloadAudio} className="w-full">
										{t('common.download-file')}
									</Button>
									<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
								</>
							)}
						</div>
					)}
				</div>

				{vm.preference.homeTabIndex === 1 && vm.summarizeSegments && (
					<Tabs value={vm.transcriptTab} onValueChange={(v) => vm.setTranscriptTab(v as 'transcript' | 'summary')} className="flex justify-center">
						<TabsList className="rounded-xl">
							<TabsTrigger value="transcript">{t('common.segments-tab')}</TabsTrigger>
							<TabsTrigger value="summary">{t('common.summary-tab')}</TabsTrigger>
						</TabsList>
					</Tabs>
				)}

				{vm.preference.homeTabIndex === 1 && (vm.segments || vm.loading) && (
					<div className="mx-auto flex h-[62vh] min-h-[320px] w-full max-w-4xl min-w-0 flex-col overflow-hidden border-t border-border/55 pt-3">
						<TextArea
							file={vm.files[0]}
							placeholder={t('common.transcript-will-displayed-shortly')}
							segments={vm.transcriptTab === 'transcript' ? vm.segments : vm.summarizeSegments}
							readonly={vm.loading}
						/>
					</div>
				)}
			</div>
		</Layout>
	)
}
