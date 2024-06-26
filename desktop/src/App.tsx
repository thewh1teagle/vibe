import '@fontsource/roboto'
import { useTranslation } from 'react-i18next'
import { Route, Routes } from 'react-router-dom'
import UpdateProgress from '~/components/UpdaterProgress'
import '~/globals.css'
import '~/lib/i18n'
import SetupPage from '~/pages/setup/Page'
import HomePage from '~/pages/home/Page'
import BatchPage from './pages/batch/Page'
import { ErrorModalProvider } from './providers/ErrorModal'
import { UpdaterProvider } from './providers/Updater'
import { PreferenceProvider } from './providers/Preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/BoundaryFallback'
import ErrorModalWithContext from './components/ErrorModalWithContext'
import { Toaster } from 'react-hot-toast'
import { FilesProvider } from './providers/FilesProvider'

export default function App() {
	const { i18n } = useTranslation()
	document.body.dir = i18n.dir()

	return (
		// Handle errors before first render
		<ErrorBoundary FallbackComponent={BoundaryFallback}>
			<ErrorModalProvider>
				<UpdaterProvider>
					<PreferenceProvider>
						<Toaster />
						<ErrorModalWithContext />
						<UpdateProgress />
						<FilesProvider>
							<Routes>
								<Route path="/" element={<HomePage />} />
								<Route path="/setup" element={<SetupPage />} />
								<Route path="/batch" element={<BatchPage />} />
							</Routes>
						</FilesProvider>
					</PreferenceProvider>
				</UpdaterProvider>
			</ErrorModalProvider>
		</ErrorBoundary>
	)
}
