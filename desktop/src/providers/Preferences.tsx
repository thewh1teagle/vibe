import { Dispatch, ReactNode, SetStateAction, createContext, useContext, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { TextFormat } from '~/components/FormatSelect'
import i18n from '~/lib/i18n'

type Direction = 'ltr' | 'rtl'

type ModifyState<T> = Dispatch<SetStateAction<T>>

// Define the type of preferences
export interface Preferences {
	displayLanguage: string
	setDisplayLanguage: ModifyState<string>
	soundOnFinish: boolean
	setSoundOnFinish: ModifyState<boolean>
	focusOnFinish: boolean
	setFocusOnFinish: ModifyState<boolean>
	modelPath: string | null
	setModelPath: ModifyState<string | null>
	skippedSetup: boolean
	setSkippedSetup: ModifyState<boolean>
	textAreaDirection: Direction
	setTextAreaDirection: ModifyState<Direction>
	textFormat: TextFormat
	setTextFormat: ModifyState<TextFormat>
	modelOptions: ModelOptions
	setModelOptions: ModifyState<ModelOptions>
	theme: 'light' | 'dark'
	setTheme: ModifyState<'light' | 'dark'>

	storeRecordInDocuments: boolean
	setStoreRecordInDocuments: ModifyState<boolean>
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
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', false)
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
		storeRecordInDocuments,
		setStoreRecordInDocuments,
	}

	return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
}
