import { ReactNode, useContext, useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { UpdaterContext } from '~/providers/updater'
import AppMenu from './app-menu'
import SettingsModal from './settings-modal'
import PageTransition from './page-transition'
import ModelDownloadPrompt from './model-download-prompt'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const [settingsScrollTo, setSettingsScrollTo] = useState<string | undefined>(undefined)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)

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
		if (window.location.hash === '#settings') {
			openSettings()
		}
		return () => window.removeEventListener('vibe:open-settings', onOpenSettings)
	}, [])

	return (
		<div className="min-h-screen">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<ModelDownloadPrompt />
			<div className="app-shell">
				<header className="mb-8 flex h-14 items-center justify-between gap-4">
					<span className="select-none text-[17px] font-semibold tracking-[-0.03em] text-foreground">{m.appTitle()}</span>
					<AppMenu onClickSettings={openSettings} availableUpdate={availableUpdate} updateApp={updateApp} />
				</header>
				<PageTransition>
					<div className="stagger-in">{children}</div>
				</PageTransition>
			</div>
		</div>
	)
}
