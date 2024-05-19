import { useContext, useEffect } from 'react'
import { FallbackProps } from 'react-error-boundary'
import { ErrorModalContext } from '~/providers/ErrorModal'
import ErrorModal from './ErrorModal'

export function BoundaryFallback({ error }: FallbackProps) {
	const { setState } = useContext(ErrorModalContext)

	useEffect(() => {
		// In case of error in first renders show the window
		// Tauri API from import won't be available...
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentWindow = (window as any).__TAURI__.webviewWindow.getCurrent()
		currentWindow.show()
		currentWindow.setFocus()
	}, [])
	return (
		<div>
			<ErrorModal setState={setState} state={{ open: true, log: `Boundary error:\n${String(error)}` }} />
		</div>
	)
}
