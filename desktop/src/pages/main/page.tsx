import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
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
			// Open by default: only an explicit collapse keeps it shut.
			return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed'
		} catch {
			return true
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
							<p className="text-sm font-medium text-muted-foreground">{m.dropToAddToQueue()}</p>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

/**
 * Sidebar visibility: user toggle everywhere; entering a multi-file (batch) session
 * closes it ONCE (its own file rail takes the space) but the toggle still reopens it.
 */
function useShowSidebar() {
	const sidebarVisible = useSidebarVisible()
	const { queue } = useSession()
	const batch = queue.jobs.length > 1
	const wasBatch = useRef(batch)
	const visibleRef = useRef(sidebarVisible)
	visibleRef.current = sidebarVisible

	useEffect(() => {
		if (batch && !wasBatch.current && visibleRef.current) {
			window.dispatchEvent(new CustomEvent(TOGGLE_SIDEBAR_EVENT))
		}
		wasBatch.current = batch
	}, [batch])

	return sidebarVisible
}

/** Full-width bottom player, ElevenLabs style: spans the whole window under sidebar and content. */
function PlayerSlot() {
	const { queue } = useSession()
	const selected = queue.selectedJob
	// The source media exists as soon as a job does — listening while it transcribes is fine.
	if (!selected) return null
	return <PlayerBar key={selected.id} job={selected} />
}

function Shell() {
	const showSidebar = useShowSidebar()

	return (
		<Layout
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
							className="flex min-h-0 overflow-hidden bg-background/90 dark:bg-background/55">
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
