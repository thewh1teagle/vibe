import { useTranslation } from 'react-i18next'
import { Route, Routes } from 'react-router-dom'
import '~/globals.css'
import '~/lib/i18n'
import SetupPage from '~/pages/setup/page'
import HomePage from '~/pages/home/page'
import { ErrorModalProvider } from './providers/error-modal'
import { PreferenceProvider } from './providers/preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/boundary-fallback'
import ErrorModalWithContext from './components/error-modal-with-context'
import { HotkeyProvider } from './providers/hotkey'
import { ToastProvider } from './providers/toast'
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
					<PreferenceProvider>
						<TooltipProvider>
							<ToastProvider>
								<HotkeyProvider>
									<ErrorModalWithContext />
									<Routes>
										<Route path="/" element={<HomePage />} />
										<Route path="/setup" element={<SetupPage />} />
									</Routes>
								</HotkeyProvider>
								<Toaster position="bottom-right" />
							</ToastProvider>
						</TooltipProvider>
					</PreferenceProvider>
				</ErrorModalProvider>
			</ErrorBoundary>
		</DirectionProvider>
	)
}
