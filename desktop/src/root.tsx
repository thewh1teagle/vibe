import { BrowserRouter } from 'react-router-dom'
import App from './app'
import DictationIndicatorWindow from './windows/dictation-indicator-window'

export default function Root() {
	const isDictationIndicator = new URLSearchParams(window.location.search).get('window') === 'dictation-indicator'

	return isDictationIndicator ? (
		<DictationIndicatorWindow />
	) : (
		<BrowserRouter>
			<App />
		</BrowserRouter>
	)
}
