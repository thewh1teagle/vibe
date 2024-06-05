import { Dispatch, ReactNode, SetStateAction, createContext, useContext } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { TextFormat } from '~/components/FormatSelect'
import i18n from '~/lib/i18n'

type Direction = 'ltr' | 'rtl'

// Define the type of preferences
export interface Preferences {
	displayLanguage: string
	setDisplayLanguage: Dispatch<SetStateAction<string>>
	soundOnFinish: boolean
	setSoundOnFinish: Dispatch<SetStateAction<boolean>>
	focusOnFinish: boolean
	setFocusOnFinish: Dispatch<SetStateAction<boolean>>
	modelPath: string | null
	setModelPath: Dispatch<SetStateAction<string | null>>
	skippedSetup: boolean
	setSkippedSetup: Dispatch<SetStateAction<boolean>>
	textAreaDirection: Direction
	setTextAreaDirection: Dispatch<SetStateAction<Direction>>
	textFormat: TextFormat
	setTextFormat: Dispatch<SetStateAction<TextFormat>>
	modelOptions: ModelOptions
	setModelOptions: Dispatch<SetStateAction<ModelOptions>>
	theme: 'light' | 'dark'
	setTheme: Dispatch<SetStateAction<'light' | 'dark'>>
}

// Create the context
const PreferencesContext = createContext<Preferences | null>(null)

// Custom hook to use the preferences context
export function usePreferencesContext() {
	return useContext(PreferencesContext) as Preferences
}

export interface ModelOptions {
	lang: string
	verbose: boolean
	n_threads?: number
	init_prompt?: string
	temperature?: number
	translate?: boolean
	max_text_ctx?: number
}

const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

// Preferences provider component
export function PreferencesProvider({ children }: { children: ReactNode }) {
	const [language, setLanguage] = useLocalStorage('prefs_display_language', i18n.language)
	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [textAreaDirection, setTextAreaDirection] = useLocalStorage<Direction>('prefs_textarea_direction', 'ltr')
	const [textFormat, setTextFormat] = useLocalStorage<TextFormat>('prefs_text_format', 'normal')
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', {
		init_prompt: '',
		verbose: false,
		lang: 'en',
		n_threads: 4,
		temperature: 0.4,
		max_text_ctx: undefined,
	})
	const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('prefs_theme', systemIsDark ? 'dark' : 'light')

	const preferences: Preferences = {
		modelOptions,
		setModelOptions,
		textFormat,
		setTextFormat,
		textAreaDirection,
		setTextAreaDirection,
		skippedSetup,
		setSkippedSetup,
		displayLanguage: language,
		setDisplayLanguage: setLanguage,
		soundOnFinish,
		setSoundOnFinish,
		focusOnFinish,
		setFocusOnFinish,
		modelPath,
		setModelPath,
		theme,
		setTheme,
	}

	return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
}
