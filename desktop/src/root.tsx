import { BrowserRouter } from 'react-router-dom'
import App from './app'
import DictationIndicatorWindow from './windows/dictation-indicator-window'
import MeetingPromptWindow from './windows/meeting-prompt-window'

export default function Root() {
	const windowName = new URLSearchParams(window.location.search).get('window')

	if (windowName === 'dictation-indicator') return <DictationIndicatorWindow />
	if (windowName === 'meeting-prompt') return <MeetingPromptWindow />

	return (
		<BrowserRouter>
			<App />
		</BrowserRouter>
	)
}
