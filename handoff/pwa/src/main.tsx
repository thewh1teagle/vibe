import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'

import { App } from '~/App'
import '~/globals.css'

// The desktop app follows the OS theme; a phone PWA has no theme switcher, so
// mirror `prefers-color-scheme` onto the `.dark` class the tokens key off.
function syncTheme() {
	const media = window.matchMedia('(prefers-color-scheme: dark)')
	const apply = () => document.documentElement.classList.toggle('dark', media.matches)
	apply()
	media.addEventListener('change', apply)
}

syncTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
		<Toaster position="top-center" richColors closeButton />
	</React.StrictMode>
)

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		// Registered at the deploy base, not the root. A worker at
		// `/vibe/phone/sw.js` gets scope `/vibe/phone/` — exactly the app's
		// subtree, and nothing of the website around it.
		const base = import.meta.env.BASE_URL
		navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
			/* installability is a nice-to-have, never fatal */
		})
	})
}
