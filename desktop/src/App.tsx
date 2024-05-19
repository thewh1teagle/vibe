import '@fontsource/roboto'
import { useTranslation } from 'react-i18next'
import { Route, Routes } from 'react-router-dom'
import ErrorModal from '~/components/ErrorModal'
import ThemeToggle from '~/components/ThemeToggle'
import UpdateProgress from '~/components/UpdaterProgress'
import '~/globals.css'
import '~/lib/i18n'
import SetupPage from '~/pages/setup/Page'
import TranscribePage from '~/pages/transcribe/Page'
import BatchPage from './pages/batch/Page'
import { ErrorModalProvider } from './providers/ErrorModal'
import { UpdaterProvider } from './providers/Updater'
import { PreferencesProvider } from './providers/Preferences'

export default function App() {
	const { i18n } = useTranslation()
	document.body.dir = i18n.dir()

	return (
		<ErrorModalProvider>
			<UpdaterProvider>
				<div className="absolute right-16 top-16">
					<ThemeToggle />
				</div>
				<ErrorModal />
				<UpdateProgress />
				<PreferencesProvider>
					<Routes>
						<Route path="/setup" element={<SetupPage />} />
						<Route path="/" element={<TranscribePage />} />
						<Route path="/batch" element={<BatchPage />} />
					</Routes>
				</PreferencesProvider>
			</UpdaterProvider>
		</ErrorModalProvider>
	)
}
