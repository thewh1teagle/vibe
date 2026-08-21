import { AnimatePresence, motion } from 'framer-motion'
import Layout from '~/components/layout'
import IdleHero from './components/idle-hero'
import SessionView from './components/session-view'
import { SessionProvider, useSession } from './session'

function MainContent() {
	const { mode, dragging } = useSession()

	return (
		<div className="relative flex h-full min-h-0 w-full flex-col">
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

export default function MainPage() {
	return (
		<Layout>
			<SessionProvider>
				<MainContent />
			</SessionProvider>
		</Layout>
	)
}
