import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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

export function useToastProvider() {
	return useContext(ToastContext) as ToastModalState
}

export function ToastProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false)
	const [message, setMessage] = useState('')
	const [progress, setProgress] = useState<number | null>(null)
	const toastId = useRef<string | number | null>(null)

	useEffect(() => {
		if (open) {
			const description = progress != null ? `${Math.round(progress)}%` : undefined
			if (toastId.current == null) {
				toastId.current = toast.loading(message || 'Loading...', { description, duration: Infinity })
			} else {
				toast.loading(message || 'Loading...', { id: toastId.current, description, duration: Infinity })
			}
		} else if (toastId.current != null) {
			toast.dismiss(toastId.current)
			toastId.current = null
		}
	}, [open, message, progress])

	return <ToastContext.Provider value={{ message, open, progress, setOpen, setProgress, setMessage }}>{children}</ToastContext.Provider>
}
