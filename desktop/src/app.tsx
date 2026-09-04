import { useEffect } from 'react'
import { getTextDirection } from '~/paraglide/runtime.js'
import { useTray } from '~/lib/tray'
import { Route, Routes } from 'react-router-dom'
import UpdateProgress from '~/components/updater-progress'
import '~/globals.css'
import SetupPage from '~/pages/setup/page'
import MainPage from '~/pages/main/page'
import { ErrorModalProvider } from './providers/error-modal'
import { UpdaterProvider } from './providers/updater'
import { PreferenceProvider } from './providers/preference'
import { usePreferenceProvider } from './providers/preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/boundary-fallback'
import ErrorModalWithContext from './components/error-modal-with-context'
import HandoffTranscriptSaver from './components/handoff-transcript-saver'
import { FilesProvider } from './providers/files-provider'
import { HotkeyProvider } from './providers/hotkey'
import { RecordingShortcutProvider } from './providers/recording-shortcut'
import { ToastProvider } from './providers/toast'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { DirectionProvider } from '~/components/ui/direction'
import { setMeetingDetectionEnabled } from '~/lib/meeting-prompt'

export default function App() {
	return (
		<PreferenceProvider>
			<AppContent />
		</PreferenceProvider>
	)
}

function AppContent() {
	const { displayLanguage, closeToTray, meetingDetectionEnabled } = usePreferenceProvider()
	const dir = getTextDirection(displayLanguage)
	useTray(closeToTray, displayLanguage)

	useEffect(() => {
		document.body.dir = dir
	}, [dir])

	useEffect(() => {
		setMeetingDetectionEnabled(meetingDetectionEnabled).catch((error) => console.error('Failed to sync meeting detection:', error))
	}, [meetingDetectionEnabled])

	return (
		<DirectionProvider dir={dir}>
			<ErrorBoundary FallbackComponent={BoundaryFallback}>
				<ErrorModalProvider>
					<UpdaterProvider>
						<TooltipProvider>
							<ToastProvider>
								<HotkeyProvider>
									<RecordingShortcutProvider>
										<ErrorModalWithContext />
										<UpdateProgress />
										{/* Phone transcriptions arrive while the user is elsewhere, so this must outlive any page. */}
										<HandoffTranscriptSaver />
										<FilesProvider>
											<Routes>
												<Route path="/" element={<MainPage />} />
												<Route path="/setup" element={<SetupPage />} />
											</Routes>
										</FilesProvider>
										<Toaster position="bottom-right" />
									</RecordingShortcutProvider>
								</HotkeyProvider>
							</ToastProvider>
						</TooltipProvider>
					</UpdaterProvider>
				</ErrorModalProvider>
			</ErrorBoundary>
		</DirectionProvider>
	)
}
