import { PanelLeft } from 'lucide-react'
import { ReactNode, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { UpdaterContext } from '~/providers/updater'
import AppMenu from './app-menu'
import SettingsModal from './settings-modal'
import PageTransition from './page-transition'
import ModelDownloadPrompt from './model-download-prompt'

/**
 * The topbar lives here but the Recents sidebar belongs to the main page, so the toggle travels as
 * a window event and the collapsed state is read from localStorage by whoever renders the sidebar.
 */
export const TOGGLE_SIDEBAR_EVENT = 'vibe:toggle-sidebar'
export const SIDEBAR_STORAGE_KEY = 'vibe_sidebar_collapsed'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const [settingsScrollTo, setSettingsScrollTo] = useState<string | undefined>(undefined)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	// Only the main page renders a Recents sidebar, so only it gets the toggle.
	const showSidebarToggle = useLocation().pathname === '/'

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
					<div className="flex items-center gap-1.5">
						{showSidebarToggle && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Toggle recents"
										className="h-9 w-9 rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground [&_svg]:size-[18px]"
										onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_SIDEBAR_EVENT))}>
										<PanelLeft strokeWidth={1.75} />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Toggle recents</TooltipContent>
							</Tooltip>
						)}
						<span className="select-none text-[17px] font-semibold tracking-[-0.03em] text-foreground">{m.appTitle()}</span>
					</div>
					<AppMenu onClickSettings={openSettings} availableUpdate={availableUpdate} updateApp={updateApp} />
				</header>
				<PageTransition>
					<div className="stagger-in">{children}</div>
				</PageTransition>
			</div>
		</div>
	)
}
