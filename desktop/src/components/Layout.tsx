import { ReactNode, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UpdaterContext } from '~/providers/Updater'
import AppMenu from './AppMenu'
import DropModal from './DropModal'
import SettingsModal from './SettingsModal'
import PageTransition from './PageTransition'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { t } = useTranslation()

	return (
		<div className="min-h-screen">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} />}
			<DropModal />
			<div className="app-shell">
				<div className="stagger-in mb-4 flex items-center justify-between gap-4 border-b border-border/55 pb-3">
					<h1 className="app-title">{t('common.app-title')}</h1>
					<AppMenu onClickSettings={() => setSettingsVisible(true)} availableUpdate={availableUpdate} updateApp={updateApp} />
				</div>
				<PageTransition>
					<div className="stagger-in [animation-delay:120ms]">{children}</div>
				</PageTransition>
			</div>
		</div>
	)
}
