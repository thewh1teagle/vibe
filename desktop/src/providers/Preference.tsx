import { invoke } from '@tauri-apps/api/core'
import { ReactNode, createContext, useContext, useEffect, useRef } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { TextFormat } from '~/components/FormatSelect'
import { ModifyState } from '~/lib/utils'
import * as os from '@tauri-apps/plugin-os'
import { supportedLanguages } from '~/lib/i18n'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { useTranslation } from 'react-i18next'

type Direction = 'ltr' | 'rtl'

// Define the type of preference
export interface Preference {
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
	gpuDevice: number
	setGpuDevice: ModifyState<number>

	highGraphicsPreference: boolean
	setHighGraphicsPreference: ModifyState<boolean>

	recognizeSpeakers: boolean
	setRecognizeSpeakers: ModifyState<boolean>
	maxSpeakers: number
	setMaxSpeakers: ModifyState<number>
	diarizeThreshold: number
	setDiarizeThreshold: ModifyState<number>
	setLanguageDirections: () => void
}

// Create the context
const PreferenceContext = createContext<Preference | null>(null)

// Custom hook to use the preference context
export function usePreferenceProvider() {
	return useContext(PreferenceContext) as Preference
}

export interface ModelOptions {
	lang: string
	verbose: boolean
	n_threads?: number
	init_prompt?: string
	temperature?: number
	translate?: boolean
	max_text_ctx?: number
	word_timestamps?: boolean
	max_sentence_len?: number
}

const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

// Preference provider component
export function PreferenceProvider({ children }: { children: ReactNode }) {
	const { i18n } = useTranslation()
	const previ18Language = useRef(i18n.language)
	const [language, setLanguage] = useLocalStorage('prefs_display_language', i18n.language)
	const [isFirstRun, setIsFirstRun] = useLocalStorage('prefs_first_localstorage_read', true)

	const [gpuDevice, setGpuDevice] = useLocalStorage<number>('prefs_gpu_device', 0)
	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [textAreaDirection, setTextAreaDirection] = useLocalStorage<Direction>('prefs_textarea_direction', 'ltr')
	const [textFormat, setTextFormat] = useLocalStorage<TextFormat>('prefs_text_format', 'normal')
	const isMounted = useRef<boolean>()
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', {
		init_prompt: '',
		verbose: false,
		lang: 'en',
		n_threads: 4,
		temperature: 0.4,
		max_text_ctx: undefined,
		word_timestamps: false,
		max_sentence_len: 1,
	})
	const [recognizeSpeakers, setRecognizeSpeakers] = useLocalStorage<boolean>('prefs_recognize_speakers', false)
	const [maxSpeakers, setMaxSpeakers] = useLocalStorage<number>('prefs_max_speakers', 5)
	const [diarizeThreshold, setDiarizeThreshold] = useLocalStorage<number>('prefs_diarize_threshold', 0.5)
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', true)
	const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('prefs_theme', systemIsDark ? 'dark' : 'light')
	const [highGraphicsPreference, setHighGraphicsPreference] = useLocalStorage<boolean>('prefs_high_graphics_performance', false)

	useEffect(() => {
		setIsFirstRun(false)
	}, [])

	useEffect(() => {
		if (!isMounted.current || os.platform() !== 'windows') {
			isMounted.current = true
			return
		}
		invoke('set_high_gpu_preference', { mode: highGraphicsPreference })
	}, [highGraphicsPreference])

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme)
	}, [theme])

	function setLanguageDefaults() {
		const name = supportedLanguages[preference.displayLanguage]
		if (name) {
			preference.setModelOptions({ ...preference.modelOptions, lang: WhisperLanguages[name as keyof typeof WhisperLanguages] })
			preference.setTextAreaDirection(i18n.dir())
		}
	}
	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true
			return
		}
		if (previ18Language.current != i18n.language || isFirstRun) {
			previ18Language.current = i18n.language
			setLanguageDefaults()
		}
	}, [i18n.language])

	useEffect(() => {
		i18n.changeLanguage(language)
	}, [language])

	const preference: Preference = {
		setLanguageDirections: setLanguageDefaults,
		diarizeThreshold,
		setDiarizeThreshold,
		maxSpeakers,
		setMaxSpeakers,
		highGraphicsPreference,
		setHighGraphicsPreference,
		recognizeSpeakers,
		setRecognizeSpeakers,
		modelOptions,
		setModelOptions,
		storeRecordInDocuments,
		setStoreRecordInDocuments,
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
		gpuDevice,
		setGpuDevice,
	}

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
