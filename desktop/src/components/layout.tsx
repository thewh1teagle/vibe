import { PanelLeft } from 'lucide-react'
import { platform } from '@tauri-apps/plugin-os'
import { ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import SettingsModal from './settings-modal'
import PageTransition from './page-transition'
import ModelDownloadPrompt from './model-download-prompt'

/**
 * The topbar lives here but the Recents sidebar belongs to the main page, so the toggle travels as
 * a window event and the collapsed state is read from localStorage by whoever renders the sidebar.
 */
export const TOGGLE_SIDEBAR_EVENT = 'vibe:toggle-sidebar'
export const SIDEBAR_STORAGE_KEY = 'vibe_sidebar_collapsed'

/** Start inset that clears the macOS traffic lights; identical for header and sidebar so the toggle never moves. */
export function titlebarInset(): number {
	return isMacOverlayTitlebar() ? 76 : 10
}

/** True in the real macOS app, where the titlebar is an overlay and traffic lights sit over our UI. */
export function isMacOverlayTitlebar(): boolean {
	try {
		return '__TAURI_INTERNALS__' in window && !('__vibeMockTauriRuntime__' in globalThis) && platform() === 'macos'
	} catch {
		return false
	}
}

export function SidebarToggleButton() {
	return (
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
	)
}

interface LayoutProps {
	children: ReactNode
	/** Full-height panel docked at the window's start edge (Claude-desktop style). */
	sidebar?: ReactNode
	/** Full-width bar docked at the very bottom of the window (player). */
	bottomBar?: ReactNode
}

export default function Layout({ children, sidebar, bottomBar }: LayoutProps) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const [settingsScrollTo, setSettingsScrollTo] = useState<string | undefined>(undefined)
	// Only the main page renders a Recents sidebar, so only it gets the toggle.
	const showSidebarToggle = useLocation().pathname === '/'

	function openSettings(scrollTo?: string) {
		setSettingsScrollTo(scrollTo)
		setSettingsVisible(true)
	}

	useEffect(() => {
		// Vibrancy: the macOS window is transparent; html/body must not paint over it.
		if (isMacOverlayTitlebar()) document.documentElement.classList.add('mac-vibrancy')
	}, [])

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
		<div className="flex h-screen min-h-0 flex-col overflow-hidden">
			{/* Single toggle, fixed to the window so it never moves when the sidebar opens or closes. */}
			{showSidebarToggle && (
				// macOS: physically left, beside the traffic lights. Elsewhere: follows the text
				// direction so RTL puts it on the same side as the sidebar.
				<div className="fixed z-50" style={isMacOverlayTitlebar() ? { left: titlebarInset(), top: 7 } : { insetInlineStart: titlebarInset(), top: 7 }}>
					<SidebarToggleButton />
				</div>
			)}
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<ModelDownloadPrompt />
			<div className="flex min-h-0 flex-1">
				{sidebar}
				<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
					<header data-tauri-drag-region className="flex h-14 shrink-0 items-center justify-end gap-4 pe-4"></header>
					<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
						<PageTransition>
							<div className="stagger-in h-full">{children}</div>
						</PageTransition>
					</div>
					{/* The player fills only the content column; the sidebar stays full height beside it. */}
					{bottomBar}
				</div>
			</div>
		</div>
	)
}
