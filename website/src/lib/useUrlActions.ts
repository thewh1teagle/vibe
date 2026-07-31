import { useEffect } from 'react'

interface UrlActionHandlers {
	[action: string]: () => void
}

export default function useUrlActions(handlers: UrlActionHandlers) {
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const action = params.get('action')

		if (action && handlers[action]) {
			handlers[action]()
			params.delete('action')
			const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
			window.history.replaceState({}, '', newUrl)
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps
}
