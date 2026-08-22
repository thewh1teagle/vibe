import { PanelLeft } from 'lucide-react'
import { platform } from '@tauri-apps/plugin-os'
import { ReactNode, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getTextDirection } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/style'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { UpdaterContext } from '~/providers/updater'
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

/** Mirrors the sidebar state the main page keeps, so the toggle knows whether the panel is showing. */
function useSidebarExpanded() {
	const [expanded, setExpanded] = useState(() => {
		try {
			// Open by default: only an explicit collapse keeps it shut.
			return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed'
		} catch {
			return true
		}
	})

	useEffect(() => {
		function toggle() {
			setExpanded((previous) => !previous)
		}
		window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggle)
		return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggle)
	}, [])

	return expanded
}

export function SidebarToggleButton() {
	const { availableUpdate } = useContext(UpdaterContext)
	const expanded = useSidebarExpanded()
	// While the sidebar is open its footer already carries the update button; the dot would double up.
	const hint = availableUpdate && !expanded

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={hint ? m.updateAvailableOpenRecents() : m.toggleRecents()}
					className="relative h-9 w-9 rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground [&_svg]:size-[18px]"
					onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_SIDEBAR_EVENT))}>
					<PanelLeft strokeWidth={1.75} />
					{hint && (
						<span aria-hidden className="absolute end-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background motion-safe:animate-pulse" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{hint ? m.updateAvailableOpenRecents() : m.toggleRecents()}</TooltipContent>
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
				// The window controls and the sidebar both live on the physical left, RTL included.
				<div className="fixed z-50" style={{ left: titlebarInset(), top: 7 }}>
					<SidebarToggleButton />
				</div>
			)}
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<ModelDownloadPrompt />
			{/* The columns are laid out left-to-right in every locale; their contents follow the text direction. */}
			<div className="flex min-h-0 flex-1" style={{ direction: 'ltr' }}>
				{sidebar}
				<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background" style={{ direction: getTextDirection() }}>
					<header data-tauri-drag-region className="flex h-14 shrink-0 items-center justify-end gap-4 pe-4"></header>
					{/*
					 * The main page owns its scrolling (transcript pane, file rail), so the shell must not
					 * scroll too — otherwise the rails drift away under the reader. Other pages scroll here.
					 * overflow-x-hidden: offscreen export copies must not turn into a sideways scroll (RTL).
					 */}
					<div className={cn('min-h-0 flex-1 overflow-x-hidden', showSidebarToggle ? 'overflow-y-hidden' : 'overflow-y-auto px-4 pb-4')}>
						<PageTransition fill={showSidebarToggle}>
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
