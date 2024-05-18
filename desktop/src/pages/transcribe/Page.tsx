import { useTranslation } from 'react-i18next'
import DropModal from '~/components/DropModal'
import LanguageInput from '~/components/LanguageInput'
import Params from '~/components/Params'
import SettingsModal from '~/components/SettingsModal'
import TextArea from '~/components/TextArea'
import AudioInput from '~/pages/transcribe/AudioInput'
import AppMenu from './AppMenu'
import ProgressPanel from './ProgressPanel'
import { viewModel } from './viewModel'

function App() {
	const { t } = useTranslation()
	const vm = viewModel()

	return (
		<div className="flex flex-col pb-[80px]">
			{vm.settingsVisible && <SettingsModal visible={vm.settingsVisible} setVisible={vm.setSettingsVisible} />}
			<DropModal />
			<div className="flex flex-col m-auto w-[300px] mt-10">
				<div className="relative text-center">
					<h1 className="text-center text-4xl mb-10">{t('common.app-title')}</h1>
					<AppMenu onClickSettings={() => vm.setSettingsVisible(true)} availableUpdate={vm.availableUpdate} updateApp={vm.updateApp} />
				</div>
				<LanguageInput onChange={(lang) => vm.setLang(lang)} />
				<AudioInput audioRef={vm.audioRef} path={vm.audioPath} setPath={vm.setAudioPath} />
				{vm.audioPath && !vm.loading && (
					<>
						<button onMouseDown={vm.transcribe} className="btn btn-primary">
							{t('common.transcribe')}
						</button>
						<Params args={vm.args} setArgs={vm.setArgs} />
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
		</div>
	)
}

export default App
