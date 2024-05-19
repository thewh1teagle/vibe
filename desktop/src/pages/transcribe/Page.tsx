import { useTranslation } from 'react-i18next'
import LanguageInput from '~/components/LanguageInput'
import Layout from '~/components/Layout'
import ModelOptions from '~/components/Params'
import TextArea from '~/components/TextArea'
import { cx } from '~/lib/utils'
import AudioInput from '~/pages/transcribe/AudioInput'
import AudioPlayer from './AudioPlayer'
import ProgressPanel from './ProgressPanel'
import { viewModel } from './viewModel'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()

	return (
		<Layout>
			<div className="flex w-[300px] flex-col m-auto">
				<div className="join join-vertical">
					<LanguageInput />
					{!vm.files.length && <AudioInput onClick={vm.selectFiles} />}
				</div>
				{vm.audio && (
					<div>
						{vm.files.length ? <AudioPlayer label={vm?.files?.[0].name} onLabelClick={vm.openFolder} audio={vm.audio} /> : null}

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
					<TextArea placeholder={t('common.transcript-will-displayed-shortly')} segments={vm.segments} readonly={vm.loading} />
				</div>
			)}
		</Layout>
	)
}

export default App
