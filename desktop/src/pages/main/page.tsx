import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import Layout, { SIDEBAR_STORAGE_KEY, TOGGLE_SIDEBAR_EVENT } from '~/components/layout'
import IdleHero from './components/idle-hero'
import PlayerBar from './components/player-bar'
import RecentsSidebar from './components/recents-sidebar'
import SessionView from './components/session-view'
import { SessionProvider, useSession } from './session'

/** Collapsed = hidden entirely; the state lives in localStorage so it survives a reload. */
function useSidebarVisible() {
	const [visible, setVisible] = useState(() => {
		try {
			return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'expanded'
		} catch {
			return false
		}
	})

	useEffect(() => {
		function toggle() {
			setVisible((previous) => {
				const next = !previous
				try {
					window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'expanded' : 'collapsed')
				} catch {
					/* private mode — the toggle still works for this session */
				}
				return next
			})
		}
		window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggle)
		return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggle)
	}, [])

	return visible
}

function MainContent() {
	const { mode, dragging } = useSession()

	return (
		<div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
			<AnimatePresence mode="wait" initial={false}>
				{mode === 'idle' ? (
					<motion.div
						key="idle"
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.15, ease: 'easeOut' }}
						className="flex min-h-0 flex-1 flex-col">
						<IdleHero />
					</motion.div>
				) : (
					<motion.div
						key="session"
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.15, ease: 'easeOut' }}
						className="flex min-h-0 flex-1 flex-col">
						<SessionView />
					</motion.div>
				)}
			</AnimatePresence>

			{/* Dropping onto a running session appends to the queue — say so. */}
			<AnimatePresence>
				{dragging && mode !== 'idle' && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15, ease: 'easeOut' }}
						className="pointer-events-none absolute inset-3 rounded-[1.25rem] border-2 border-dashed border-ring/40 bg-background/60 backdrop-blur-[2px]">
						<div className="flex h-full items-center justify-center">
							<p className="text-sm font-medium text-muted-foreground">Drop to add to the queue</p>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

/** Sidebar visibility: user toggle, forced closed while a multi-file (batch) session runs. */
function useShowSidebar() {
	const sidebarVisible = useSidebarVisible()
	const { queue } = useSession()
	return sidebarVisible && queue.jobs.length <= 1
}

/** Full-width bottom player, ElevenLabs style: spans the whole window under sidebar and content. */
function PlayerSlot() {
	const { queue } = useSession()
	const selected = queue.selectedJob
	if (!selected || (selected.status !== 'done' && !selected.hydrated)) return null
	return <PlayerBar key={selected.id} job={selected} />
}

function Shell() {
	const showSidebar = useShowSidebar()

	return (
		<Layout
			sidebarOpen={showSidebar}
			bottomBar={<PlayerSlot />}
			sidebar={
				<AnimatePresence initial={false}>
					{showSidebar && (
						<motion.div
							key="recents"
							initial={{ opacity: 0, width: 0 }}
							animate={{ opacity: 1, width: 'auto' }}
							exit={{ opacity: 0, width: 0 }}
							transition={{ duration: 0.2, ease: 'easeOut' }}
							className="flex min-h-0 overflow-hidden bg-muted/25">
							<RecentsSidebar />
						</motion.div>
					)}
				</AnimatePresence>
			}>
			<MainContent />
		</Layout>
	)
}

export default function MainPage() {
	return (
		<SessionProvider>
			<Shell />
		</SessionProvider>
	)
}
