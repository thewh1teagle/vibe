import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n'
import './globals.css'
import App from './App'

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
function syncThemeWithSystem(isDark: boolean) {
	document.documentElement.classList.toggle('dark', isDark)
}

syncThemeWithSystem(mediaQuery.matches)
mediaQuery.addEventListener('change', (event) => syncThemeWithSystem(event.matches))

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
