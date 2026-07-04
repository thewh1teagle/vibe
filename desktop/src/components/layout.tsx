import { ReactNode, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UpdaterContext } from '~/providers/updater'
import AppMenu from './app-menu'
import DropModal from './drop-modal'
import SettingsModal from './settings-modal'
import PageTransition from './page-transition'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const [settingsScrollTo, setSettingsScrollTo] = useState<string | undefined>(undefined)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { t } = useTranslation()

	function openSettings(scrollTo?: string) {
		setSettingsScrollTo(scrollTo)
		setSettingsVisible(true)
	}

	useEffect(() => {
		function onOpenSettings(event: Event) {
			const scrollTo = (event as CustomEvent<{ scrollTo?: string }>).detail?.scrollTo
			openSettings(scrollTo)
		}
		window.addEventListener('vibe:open-settings', onOpenSettings)
		return () => window.removeEventListener('vibe:open-settings', onOpenSettings)
	}, [])

	return (
		<div className="min-h-screen">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<DropModal />
			<div className="app-shell">
				<div className="stagger-in mb-6 flex items-center justify-between gap-4 pb-1">
					<h1 className="app-title">{t('common.app-title')}</h1>
					<AppMenu onClickSettings={openSettings} availableUpdate={availableUpdate} updateApp={updateApp} />
				</div>
				<PageTransition>
					<div className="stagger-in [animation-delay:120ms]">{children}</div>
				</PageTransition>
			</div>
		</div>
	)
}
