import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import DictationIndicator from './components/dictation-indicator'
import './globals.css'
import { m } from './paraglide/messages.js'

const isDictationIndicator = new URLSearchParams(window.location.search).get('window') === 'dictation-indicator'
if (isDictationIndicator) {
	document.title = m.appTitle()
	document.documentElement.classList.add('dictation-indicator-window')
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	isDictationIndicator ? (
		<DictationIndicator />
	) : (
		<BrowserRouter>
			<App />
		</BrowserRouter>
	),
)
