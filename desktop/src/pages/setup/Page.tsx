import { useTranslation } from 'react-i18next'
import ThemeToggle from '~/components/ThemeToggle'
import { viewModel } from './viewModel'

function App() {
    const { t } = useTranslation()
    const vm = viewModel()

    return (
        <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center">
            <div className="absolute right-16 top-16">
                <ThemeToggle />
            </div>
            <div className="text-3xl m-5 font-bold">{t('downloading-model')}</div>
            {vm.downloadProgress > 0 && (
                <>
                    <progress className="progress progress-primary w-56 my-2" value={vm.downloadProgress} max="100"></progress>
                    <p>{t('this-happens-once')}</p>
                </>
            )}
            {(vm.downloadProgress === 0 || vm.isOnline === null) && <span className="loading loading-spinner loading-lg"></span>}
            <div className="tooltip mt-6" data-tip={t('info-cancel-download')}>
                <button className="btn btn-xs text-error text-xs" onClick={vm.cancel}>
                    {t('cancel')}
                </button>
            </div>
            {vm.isOnline === false && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h1 className="text-3xl text-center">{t('no-connection')}</h1>
                        <p className="mt-3 text-center">{t('info-manual-download')}</p>
                        <div className="flex flex-col justify-center mt-5 gap-2">
                            <button className="btn btn-primary flex-1" onClick={vm.downloadIfOnline}>
                                {t('try-again')}
                            </button>
                            <button className="btn btn-sm" onClick={vm.cancel}>
                                {t('i-prefer-manual-setup')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
