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
import { FilesProvider } from './providers/FilesProvider'
import { HotkeyProvider } from './providers/Hotkey'
import { ToastProvider } from './providers/Toast'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { DirectionProvider } from '~/components/ui/direction'

export default function App() {
	const { i18n } = useTranslation()
	const dir = i18n.dir()
	document.body.dir = dir

	return (
		<DirectionProvider dir={dir}>
			<ErrorBoundary FallbackComponent={BoundaryFallback}>
				<ErrorModalProvider>
					<UpdaterProvider>
						<PreferenceProvider>
							<TooltipProvider>
								<ToastProvider>
									<HotkeyProvider>
									<ErrorModalWithContext />
									<UpdateProgress />
									<FilesProvider>
										<Routes>
											<Route path="/" element={<HomePage />} />
											<Route path="/setup" element={<SetupPage />} />
											<Route path="/batch" element={<BatchPage />} />
										</Routes>
									</FilesProvider>
									<Toaster position="bottom-right" />
								</HotkeyProvider>
								</ToastProvider>
							</TooltipProvider>
						</PreferenceProvider>
					</UpdaterProvider>
				</ErrorModalProvider>
			</ErrorBoundary>
		</DirectionProvider>
	)
}
