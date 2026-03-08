import { Dispatch, SetStateAction } from 'react'

export interface NamedPath {
	name: string
	path: string
}

export type ModifyState<T> = Dispatch<SetStateAction<T>>
