import { ReactNode, createContext, useState } from 'react'
import { ModifyState } from '~/lib/utils'

export interface ErrorModalState {
	open: boolean
	log?: string
}
interface ErrorModalContext {
	state: ErrorModalState
	setState: ModifyState<ErrorModalState>
}

export const ErrorModalContext = createContext<ErrorModalContext>({} as ErrorModalContext)

export function ErrorModalProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<ErrorModalState>({ open: false, log: '' })
	return <ErrorModalContext.Provider value={{ setState, state }}>{children}</ErrorModalContext.Provider>
}
