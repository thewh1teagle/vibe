import { useTranslation } from 'react-i18next'
import AudioInput from '../../components/AudioInput'
import LanguageInput from '../../components/LanguageInput'
import Params from '../../components/Params'
import TextArea from '../../components/TextArea'
import { useTranscribeViewModel } from './useTranscribeViewmodel'
import AppMenu from '../../components/AppMenu'
import DropModal from '../../components/DropModal'
import SettingsPage from '../settings/SettingsPage'
import { cx } from '../../lib/utils'

function App() {
    const { t } = useTranslation()
    const vm = useTranscribeViewModel()

    return (
        <div className="flex flex-col pb-[80px]">
            {vm.settingsVisible && (
                <div className={cx('modal modal-open backdrop-blur-3xl !bg-base-100 dark:!bg-transparent overflow-y-auto')}>
                    <SettingsPage setVisible={vm.setSettingsVisible} />
                </div>
            )}

            <DropModal />
            <div className="flex flex-col m-auto w-[300px] mt-10">
                <div className="relative text-center">
                    <h1 className="text-center text-4xl mb-10">{t('app-title')}</h1>
                    <AppMenu onClickSettings={() => vm.setSettingsVisible(true)} availableUpdate={vm.availableUpdate} updateApp={vm.updateApp} />
                </div>
                <LanguageInput onChange={(lang) => vm.setLang(lang)} />
                <AudioInput audioRef={vm.audioRef} path={vm.audioPath} setPath={vm.setAudioPath} />
                {vm.audioPath && !vm.loading && (
                    <>
                        <button onMouseDown={vm.transcribe} className="btn btn-primary">
                            {t('transcribe')}
                        </button>
                        <Params args={vm.args} setArgs={vm.setArgs} />
                    </>
                )}
            </div>
            <div className="h-20" />
            {vm.loading && (
                <div className="w-full flex flex-col items-center">
                    <div className="flex flex-row items-center text-center gap-3 bg-base-200 p-4 rounded-2xl">
                        <span className="loading loading-spinner text-primary"></span>
                        {vm.isAborting ? <p>{t('aborting')}...</p> : (
                            <p>
                                {t('transcribing')} {vm.progress ? `${Math.round(vm.progress)}%` : '0%'}
                            </p>
                        )}
                        {!vm.isAborting && (
                            <button onClick={vm.onAbort} className="btn btn-primary btn-ghost btn-sm text-red-500">
                                {t('cancel')}

                            </button>
                        )}

                        {/* <p>{t("you-will-receive-notification")}</p> */}
                    </div>
                </div>
            )}
            {(vm.segments || vm.loading) && (
                <div className="flex flex-col mt-5 items-center w-[90%] max-w-[1000px] h-[84vh] m-auto">
                    <TextArea placeholder={t('transcript-will-displayed-shortly')} segments={vm.segments} readonly={vm.loading} />
                </div>
            )}
        </div>
    )
}

export default App
