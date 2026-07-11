import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import Layout from '~/components/layout'
import TextArea from '~/components/text-area'
import AudioInput from '~/pages/home/audio-input'
import AudioPlayer from './audio-player'
import ProgressPanel from './progress-panel'
import { viewModel } from './view-model'
import { HomeTab } from '~/providers/preference'
import AudioDeviceInput from '~/components/audio-device-input'
import { ReactComponent as FileIcon } from '~/icons/file.svg'
import { ReactComponent as MicrphoneIcon } from '~/icons/microphone.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { useEffect } from 'react'
import { webviewWindow } from '@tauri-apps/api'
import * as keepAwake from 'tauri-plugin-keepawake-api'
import { Button } from '~/components/ui/button'
import DictationPromo from '~/components/dictation-promo'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import AudioVisualizer from './audio-visualizer'
import ResummarizeDialog from '~/components/resummarize-dialog'

export default function Home() {
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
				<div className="app-main-card mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center gap-5">
					<Tabs
						value={vm.preference.homeTab}
						onValueChange={(v) => (v === 'link' ? vm.switchToLinkTab() : vm.preference.setHomeTab(v as HomeTab))}
						className="flex flex-col items-center">
						<TabsList className="h-14 rounded-2xl border border-border/50 bg-muted/60 p-1.5 shadow-xs">
							<TabsTrigger
								value="record"
								className="h-11 min-w-14 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
								<MicrphoneIcon className="h-[19px] w-[19px]" />
							</TabsTrigger>
							<TabsTrigger
								value="file"
								className="h-11 min-w-14 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
								<FileIcon className="h-[19px] w-[19px]" />
							</TabsTrigger>
							<TabsTrigger
								value="link"
								className="h-11 min-w-14 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
								<LinkIcon className="h-[19px] w-[19px]" />
							</TabsTrigger>
						</TabsList>
					</Tabs>

					{vm.preference.homeTab === "record" && (
						<div className="w-full min-w-0 max-w-2xl space-y-5">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<AudioDeviceInput device={vm.inputDevice} setDevice={vm.setInputDevice} devices={vm.devices} type="input" />
								<AudioDeviceInput device={vm.outputDevice} setDevice={vm.setOutputDevice} devices={vm.devices} type="output" />
							</div>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label>{m.recordingName()}</Label>
									<Input
										type="text"
										value={vm.recordingName}
										onChange={(event) => vm.setRecordingName(event.target.value)}
										placeholder={m.recordingNamePlaceholder()}
										disabled={vm.isRecording}
									/>
								</div>
								<div className="space-y-2">
									<Label>{m.saveRecordInDocumentsFolder()}</Label>
									<div className="flex h-11 items-center justify-between rounded-xl border border-border/40 bg-muted/40 px-4">
										<span className="text-sm text-muted-foreground">{vm.preference.storeRecordInDocuments ? m.enabled() : m.disabled()}</span>
										<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
									</div>
								</div>
							</div>

							{!vm.isRecording ? (
								<Button onMouseDown={() => vm.startRecord()} className="mt-1 w-full" disabled={!vm.preference.modelPath || (!vm.inputDevice && !vm.outputDevice)}>
									{m.startRecord()}
								</Button>
							) : (
								<Button
									onMouseDown={() => {
										keepAwake.stop()
										vm.stopRecord()
									}}
									className="mt-1 w-full bg-success text-success-foreground hover:bg-success/90">
									<Spinner className="mr-2" />
									{m.stopAndTranscribe()}
								</Button>
							)}

							{!vm.preference.modelPath && (
								<p className="text-center text-sm text-muted-foreground">{m.noModelSelected()}</p>
							)}

							{vm.inputDevice && <AudioVisualizer isRecording={vm.isRecording} inputDevice={vm.inputDevice} />}

							<DictationPromo />

						</div>
					)}

					{vm.preference.homeTab === "file" && (
						<div className="w-full min-w-0 max-w-3xl space-y-5">
							<div className="space-y-3">
								<LanguageInput />
								{!vm.files.length && !vm.selectedFolder && <AudioInput onClick={vm.selectFiles} onSelectFolder={vm.selectFolder} />}

								{vm.selectedFolder && (
									<div className="space-y-3 rounded-lg border border-border/70 bg-card/70 p-3">
										<div className="text-xs text-muted-foreground">{vm.selectedFolder}</div>
										<div className="text-sm font-medium">
											{m.files()}: {vm.files.length}
										</div>
										<div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2.5">
											<span className="text-sm">{m.includeSubFolders()}</span>
											<Switch
												checked={vm.preference.advancedTranscribeOptions.includeSubFolders}
												onCheckedChange={(checked) =>
													vm.preference.setAdvancedTranscribeOptions({
														...vm.preference.advancedTranscribeOptions,
														includeSubFolders: checked,
													})
												}
											/>
										</div>
										<div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2.5">
											<span className="text-sm">{m.skipIfTranscriptExists()}</span>
											<Switch
												checked={vm.preference.advancedTranscribeOptions.skipIfExists}
												onCheckedChange={(checked) =>
													vm.preference.setAdvancedTranscribeOptions({
														...vm.preference.advancedTranscribeOptions,
														skipIfExists: checked,
													})
												}
											/>
										</div>
										<div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3.5 py-2.5">
											<span className="text-sm">{m.placeTranscriptNextToFiles()}</span>
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
											<Button
												onMouseDown={vm.startFolderBatch}
												className="flex-1"
												disabled={vm.isCollectingFolder || vm.files.length === 0 || !vm.preference.modelPath}>
												{vm.isCollectingFolder && <Spinner className="mr-2" />}
												{m.transcribeFolder()}
											</Button>
											<Button variant="ghost" onMouseDown={vm.clearFolderSelection}>
												{m.changeFile()}
											</Button>
										</div>
									</div>
								)}
							</div>
							{vm.audio && (
								<div>
									{vm.files.length ? (
										<AudioPlayer label={vm.files[0].name} onLabelClick={() => vm.openPath(vm.files[0])} audio={vm.audio} />
									) : null}
									{!vm.loading && (
										<Button variant="link" onMouseDown={vm.selectFiles} className="mb-2 mt-1 px-0 text-xs">
											{m.changeFile()}
										</Button>
									)}
								</div>
							)}
							{vm.audio && !vm.loading && (
								<>
									<Button onMouseDown={() => vm.transcribe(vm.files[0].path)} className="mt-1 w-full" disabled={!vm.preference.modelPath}>
										{m.transcribe()}
									</Button>
									{!vm.preference.modelPath && (
										<p className="text-center text-sm text-muted-foreground">{m.noModelSelected()}</p>
									)}
								</>
							)}
							{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}
						</div>
					)}

					{vm.preference.homeTab === "link" && (
						<div className="w-full min-w-0 max-w-2xl space-y-5">
							<Input
								type="text"
								value={vm.audioUrl}
								onChange={(event) => vm.setAudioUrl(event.target.value)}
								placeholder="https://www.youtube.com/watch?v=aj8-ABRl1Jo"
								onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadAudio() : null)}
							/>

							{vm.downloadingAudio ? (
								<div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border/40 bg-muted/40 px-4 py-3">
									<Spinner className="text-primary" />
					<p>{m.downloading({ progress: String(vm.ytdlpProgress ?? 0) })}</p>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => vm.cancelYtDlpDownload()}
										className="text-destructive hover:text-destructive/80">
										{m.cancel()}
									</Button>
								</div>
							) : (
								<>
									<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/40 px-4 py-3">
										<span className="text-sm font-medium">{m.saveRecordInDocumentsFolder()}</span>
										<Switch checked={vm.preference.storeRecordInDocuments} onCheckedChange={vm.preference.setStoreRecordInDocuments} />
									</div>
									<Button onMouseDown={vm.downloadAudio} className="w-full" disabled={!vm.preference.modelPath}>
										{m.downloadFile()}
									</Button>
									{!vm.preference.modelPath && (
										<p className="text-center text-sm text-muted-foreground">{m.noModelSelected()}</p>
									)}
								</>
							)}
						</div>
					)}
				</div>

				{vm.preference.homeTab === "file" && vm.summarizeSegments && !vm.loading && (
					<div className="flex items-center justify-center gap-2">
						<Tabs value={vm.transcriptTab} onValueChange={(v) => vm.setTranscriptTab(v as 'transcript' | 'summary')}>
							<TabsList className="rounded-xl">
								<TabsTrigger value="transcript">{m.segmentsTab()}</TabsTrigger>
								<TabsTrigger value="summary">{m.summaryTab()}</TabsTrigger>
							</TabsList>
						</Tabs>
						<ResummarizeDialog onSubmit={vm.resummarize} loading={vm.summarizing} />
					</div>
				)}

				{vm.preference.homeTab === "file" && (vm.segments || vm.loading) && (
					<div className="mx-auto flex h-[62vh] min-h-[320px] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg dark:shadow-2xl">
						<TextArea
							file={vm.files[0]}
							placeholder={m.transcriptWillDisplayedShortly()}
							segments={vm.transcriptTab === 'transcript' ? vm.segments : vm.summarizeSegments}
							textFormat={vm.transcriptTab === 'transcript' ? vm.preference.textFormatTranscript : vm.preference.textFormatSummary}
							setTextFormat={
								vm.transcriptTab === 'transcript' ? vm.preference.setTextFormatTranscript : vm.preference.setTextFormatSummary
							}
							readonly={vm.loading}
						/>
					</div>
				)}
			</div>
		</Layout>
	)
}
