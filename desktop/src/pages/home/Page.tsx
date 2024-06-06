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
import { useEffect, useState } from 'react'
import * as webviewWindow from '@tauri-apps/api/webviewWindow'
import AudioDeviceInput from '~/components/AudioDeviceInput'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()

	const [tabIndex, setTabIndex] = useState(1)

	async function showWindow() {
		const currentWindow = await webviewWindow.getCurrent()
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
				<a role="tab" onClick={() => setTabIndex(0)} className={cx('tab', tabIndex === 0 && 'tab-active')}>
					{t('common.files')}
				</a>
				<a role="tab" onClick={() => setTabIndex(1)} className={cx('tab', tabIndex === 1 && 'tab-active')}>
					{t('common.record')}
				</a>
			</div>
			{tabIndex === 0 && (
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
								<button onMouseDown={vm.transcribe} className="btn btn-primary mt-3">
									{t('common.transcribe')}
								</button>
								<ModelOptions options={vm.preferences.modelOptions} setOptions={vm.preferences.setModelOptions} />
							</>
						)}
					</div>
					<div className="h-20" />
					{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}
					{(vm.segments || vm.loading) && (
						<div className="flex flex-col mt-5 items-center w-[90%] max-w-[1000px] h-[84vh] m-auto">
							<TextArea
								file={vm.files?.[0]}
								placeholder={t('common.transcript-will-displayed-shortly')}
								segments={vm.segments}
								readonly={vm.loading}
							/>
						</div>
					)}
				</>
			)}

			{tabIndex === 1 && (
				<>
					<div className="flex w-[300px] flex-col m-auto">
						<div className="join join-vertical">
							<LanguageInput />
							<AudioDeviceInput type="input" />
							<AudioDeviceInput type="output" />
						</div>
						{!vm.loading && (
							<button onMouseDown={vm.startRecord} className="btn btn-primary mt-3">
								{t('common.start-record')}
							</button>
						)}

						{vm.loading && (
							<>
								<button onMouseDown={vm.startRecord} className="btn relative btn-primary mt-3">
									<span className="loading loading-spinner"></span>
									{t('common.stop-and-transcribe')}
								</button>
							</>
						)}
					</div>

					<div className="h-20" />
					{vm.loading && <ProgressPanel isAborting={vm.isAborting} onAbort={vm.onAbort} progress={vm.progress} />}
					{(vm.segments || vm.loading) && (
						<div className="flex flex-col mt-5 items-center w-[90%] max-w-[1000px] h-[84vh] m-auto">
							<TextArea
								file={vm.files?.[0]}
								placeholder={t('common.transcript-will-displayed-shortly')}
								segments={vm.segments}
								readonly={vm.loading}
							/>
						</div>
					)}
				</>
			)}
		</Layout>
	)
}
