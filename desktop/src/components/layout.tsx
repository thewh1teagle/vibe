import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppMenu from './app-menu'
import SettingsModal from './settings-modal'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const { t } = useTranslation()

	return (
		<div className="min-h-screen">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} />}
			<div className="app-shell">
				<div className="stagger-in mb-4 flex items-center justify-between gap-4 border-b border-border/55 pb-3">
					<h1 className="app-title">{t('common.app-title')}</h1>
					<AppMenu onClickSettings={() => setSettingsVisible(true)} />
				</div>
				<div className="stagger-in [animation-delay:120ms]">{children}</div>
			</div>
		</div>
	)
}
