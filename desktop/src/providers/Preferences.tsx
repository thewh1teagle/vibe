import { Dispatch, ReactNode, SetStateAction, createContext, useContext } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import i18n from '~/lib/i18n'

type Direction = 'ltr' | 'rtl'

// Define the type of preferences
interface Preferences {
	displayLanguage: string
	setDisplayLanguage: Dispatch<SetStateAction<string>>
	soundOnFinish: boolean
	setSoundOnFinish: Dispatch<SetStateAction<boolean>>
	focusOnFinish: boolean
	setFocusOnFinish: Dispatch<SetStateAction<boolean>>
	modelPath: string | null
	setModelPath: Dispatch<SetStateAction<string | null>>
	transcribeLanguage: string
	setTranscribeLanguage: Dispatch<SetStateAction<string>>
	skippedSetup: boolean
	setSkippedSetup: Dispatch<SetStateAction<boolean>>
	textAreaDirection: Direction
	setTextAreaDirection: Dispatch<SetStateAction<Direction>>
}

// Create the context
const PreferencesContext = createContext<Preferences | null>(null)

// Custom hook to use the preferences context
export function usePreferencesContext() {
	return useContext(PreferencesContext) as Preferences
}

// Preferences provider component
export function PreferencesProvider({ children }: { children: ReactNode }) {
	const [transcribeLanguage, setTranscribeLanguage] = useLocalStorage<string>('prefs_transcribe_language', 'en')
	const [language, setLanguage] = useLocalStorage('prefs_display_language', i18n.language)
	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [textAreaDirection, setTextAreaDirection] = useLocalStorage<Direction>('prefs_textarea_direction', 'ltr')

	const preferences: Preferences = {
		textAreaDirection,
		setTextAreaDirection,
		skippedSetup,
		setSkippedSetup,
		transcribeLanguage,
		setTranscribeLanguage,
		displayLanguage: language,
		setDisplayLanguage: setLanguage,
		soundOnFinish,
		setSoundOnFinish,
		focusOnFinish,
		setFocusOnFinish,
		modelPath,
		setModelPath,
	}

	return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
}
