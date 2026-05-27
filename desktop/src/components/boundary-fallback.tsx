import { useContext, useEffect } from 'react'
import { FallbackProps } from 'react-error-boundary'
import { ErrorModalContext } from '~/providers/error-modal'
import ErrorModal from './error-modal'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function BoundaryFallback({ error }: FallbackProps) {
	const { setState } = useContext(ErrorModalContext)

	useEffect(() => {
		const currentWindow = getCurrentWindow()
		currentWindow.show()
		currentWindow.setFocus()
	}, [])
	return (
		<div>
			<ErrorModal setState={setState} state={{ open: true, log: `Boundary error:\n${String(error)}` }} />
		</div>
	)
}
