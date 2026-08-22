import { ReactNode } from 'react'
import { motion } from 'framer-motion'

/** `fill` makes the page exactly as tall as the shell, for pages that scroll their own panes. */
export default function PageTransition({ children, fill }: { children: ReactNode; fill?: boolean }) {
	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className={fill ? 'h-full w-full' : 'w-full'}>
			{children}
		</motion.div>
	)
}
