import { ReactNode } from 'react'
import { motion } from 'framer-motion'

export default function PageTransition({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="w-full"
        >
            {children}
        </motion.div>
    )
}
