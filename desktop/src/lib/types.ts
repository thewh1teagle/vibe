import { Dispatch, SetStateAction } from 'react'

export type ProjectSource = 'record' | 'url' | 'file'

export interface NamedPath {
	name: string
	path: string
	/** Origin of a newly created project. Omitted by paths that are not transcription inputs. */
	source?: ProjectSource
}

export type ModifyState<T> = Dispatch<SetStateAction<T>>
