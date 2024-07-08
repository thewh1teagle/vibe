import { ReactNode, createContext, useContext, useState } from 'react'
import { ModifyState } from '~/lib/utils'

export interface ToastModalState {
	open: boolean
	setOpen: ModifyState<boolean>
	message: string
	setMessage: ModifyState<string>
	progress: number | null
	setProgress: ModifyState<number | null>
}

export const ToastContext = createContext<ToastModalState | null>(null)

// Custom hook to use the preference context
export function useToastProvider() {
	return useContext(ToastContext) as ToastModalState
}

export function ToastProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false)
	const [message, setMessage] = useState('')
	const [progress, setProgress] = useState<number | null>(null)
	return <ToastContext.Provider value={{ message, open, progress, setOpen, setProgress, setMessage }}>{children}</ToastContext.Provider>
}
