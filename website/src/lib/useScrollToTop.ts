import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Starts each page at its top. The router swaps the page and leaves the scroll where it was,
 * so a footer link opened the next page at its footer.
 *
 * Back and forward are left to the browser, which restores where the reader was. A link with
 * a hash goes to its anchor, and a change of query alone (the language filter on the models
 * page) is the same page, so neither moves. Clicking the link of the page you are on does.
 */
export default function useScrollToTop() {
	const location = useLocation()
	const type = useNavigationType()
	const previous = useRef(location)

	useEffect(() => {
		const from = previous.current
		previous.current = location
		if (from === location || type === 'POP' || location.hash) return
		const samePage = from.pathname === location.pathname
		if (samePage && from.search !== location.search) return
		window.scrollTo({ top: 0, left: 0, behavior: samePage ? 'smooth' : 'instant' })
	}, [location, type])
}
