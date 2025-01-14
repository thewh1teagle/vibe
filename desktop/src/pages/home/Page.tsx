import { useTranslation } from 'react-i18next'
import LanguageInput from '~/components/LanguageInput'
import Layout from '~/components/Layout'
import ModelOptions from '~/components/Params'
import TextArea from '~/components/TextArea'
import { cx } from '~/lib/utils'
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

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()

	async function showWindow() {
		const currentWindow = webviewWindow.getCurrentWebviewWindow()
		await currentWindow.show()
		if (import.meta.env.PROD) {
			await currentWindow.setFocus()
		}
	}

	useEffect(() => {
		showWindow()
	}, [])

	return (
		<Layout>
			<div role="tablist" className="tabs tabs-lifted flex m-auto mt-5">
				<a
					role="tab"
					onClick={() => vm.preference.setHomeTabIndex(0)}
					className={cx('tab [--tab-border-color:gray]', vm.preference.homeTabIndex === 0 && 'tab-active')}>
					<MicrphoneIcon className="w-[18px] h-[18px]" />
				</a>
				<a
					role="tab"
					onClick={() => vm.preference.setHomeTabIndex(1)}
					className={cx('tab [--tab-border-color:gray]', vm.preference.homeTabIndex === 1 && 'tab-active')}>
					<FileIcon className="w-[18px] h-[18px]" />
				</a>
				<a role="tab" onClick={vm.switchToLinkTab} className={cx('tab [--tab-border-color:gray]', vm.preference.homeTabIndex === 2 && 'tab-active')}>
					<LinkIcon className="w-[18px] h-[18px]" />
				</a>
			</div>

			{/* Record */}
			{vm.preference.homeTabIndex === 0 && (
				<>
					<div className="flex w-[300px] flex-col m-auto">
						<div className="">
							<AudioDeviceInput device={vm.inputDevice} setDevice={vm.setInputDevice} devices={vm.devices} type="input" />
							<AudioDeviceInput device={vm.outputDevice} setDevice={vm.setOutputDevice} devices={vm.devices} type="output" />
							<label className="label cursor-pointer mt-2 mb-5">
								<span className="label-text">{t('common.save-record-in-documents-folder')}</span>
								<input
									type="checkbox"
									className="toggle toggle-primary"
									onChange={(e) => vm.preference.setStoreRecordInDocuments(e.target.checked)}
									checked={vm.preference.storeRecordInDocuments}
								/>
							</label>
						</div>
						{!vm.isRecording && (
							<button onMouseDown={() => vm.startRecord()} className="btn btn-primary mt-3">
								{t('common.start-record')}
							</button>
						)}

						{vm.isRecording && (
							<>
								<button
									onMouseDown={() => {
										// Stop keepawake
										console.log('stop keepawake')
										keepAwake.stop()
										vm.stopRecord()
									}}
									className="btn relative btn-success mt-3">
									<span className="loading loading-spinner"></span>
									{t('common.stop-and-transcribe')}
								</button>
							</>
						)}

						<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
					</div>
				</>
			)}
			{/* File */}
			{vm.preference.homeTabIndex === 1 && (
				<>
					<div className="flex w-[300px] flex-col m-auto">
						<div className="join join-vertical">
							<LanguageInput />
							{!vm.files.length && <AudioInput onClick={vm.selectFiles} />}
						</div>
						{vm.audio && (
							<div>
								{vm.files.length ? (
									<AudioPlayer label={vm?.files?.[0].name} onLabelClick={() => vm.openPath(vm?.files?.[0])} audio={vm.audio} />
								) : null}

								{!vm.loading && (
									<div onMouseDown={vm.selectFiles} className={cx('text-xs text-base-content font-medium cursor-pointer mb-3 mt-1')}>
										{t('common.change-file')}
									</div>
								)}
							</div>
						)}
						{vm.audio && !vm.loading && (
							<>
								<button onMouseDown={() => vm.transcribe(vm.files[0].path)} className="btn btn-primary mt-3">
									{t('common.transcribe')}
								</button>
								<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
							</>
						)}
					</div>
					<div className="h-20" />
					{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}
					{vm.summarizeSegments && (
						<div role="tablist" className="tabs tabs-lifted tabs-lg self-center">
							<a
								onClick={() => vm.setTranscriptTab('transcript')}
								role="tab"
								className={cx('tab ', vm.transcriptTab == 'transcript' && 'text-primary font-medium tab-active')}>
								{t('common.segments-tab')}
							</a>

							<a
								onClick={() => vm.setTranscriptTab('summary')}
								role="tab"
								className={cx('tab', vm.transcriptTab == 'summary' && 'text-primary font-medium tab-active')}>
								{t('common.summary-tab')}
							</a>
						</div>
					)}
					{(vm.segments || vm.loading) && (
						<div className="flex flex-col mt-5 items-center w-[90%] max-w-[1000px] h-[84vh] m-auto">
							<TextArea
								setSegments={vm.transcriptTab == 'transcript' ? vm.setSegments : vm.setSummarizeSegments}
								file={vm.files?.[0]}
								placeholder={t('common.transcript-will-displayed-shortly')}
								segments={vm.transcriptTab == 'transcript' ? vm.segments : vm.summarizeSegments}
								readonly={vm.loading}
							/>
						</div>
					)}
				</>
			)}

			{/* URL */}
			{vm.preference.homeTabIndex === 2 && (
				<div className="flex w-[300px] flex-col m-auto">
					<div className="flex flex-col gap-0 mt-5">
						<input
							type="text"
							className="input input-bordered"
							value={vm.audioUrl}
							onChange={(event) => vm.setAudioUrl(event.target.value)}
							placeholder="https://www.youtube.com/watch?v=aj8-ABRl1Jo"
							onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadAudio() : null)}
						/>

						{vm.downloadingAudio ? (
							<>
								<div className="w-full flex flex-col items-center mt-5">
									<div className="flex flex-row items-center text-center gap-3 bg-base-200 p-4 rounded-2xl">
										<span className="loading loading-spinner text-primary"></span>
										<p>{t('common.downloading', { progress: vm.ytdlpProgress })}</p>
										<button onClick={() => vm.cancelYtDlpDownload()} className="btn btn-primary btn-ghost btn-sm text-red-500">
											{t('common.cancel')}
										</button>
									</div>
								</div>
							</>
						) : (
							<>
								<label className="label cursor-pointer mt-2 mb-5">
									<span className="label-text">{t('common.save-record-in-documents-folder')}</span>
									<input
										type="checkbox"
										className="toggle toggle-primary"
										onChange={(e) => vm.preference.setStoreRecordInDocuments(e.target.checked)}
										checked={vm.preference.storeRecordInDocuments}
									/>
								</label>

								<button onMouseDown={vm.downloadAudio} className="btn btn-primary mt-0">
									{t('common.download-file')}
								</button>
								<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
							</>
						)}
					</div>
				</div>
			)}
		</Layout>
	)
}
