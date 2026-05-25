import { ReactNode, createContext, useContext, useEffect, useRef } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { ModifyState } from '~/lib/types'
import { supportedLanguages } from '~/lib/i18n'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { useTranslation } from 'react-i18next'

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
	modelOptions: ModelOptions
	setModelOptions: ModifyState<ModelOptions>
	theme: 'light' | 'dark'
	setTheme: ModifyState<'light' | 'dark'>
	storeRecordInDocuments: boolean
	setStoreRecordInDocuments: ModifyState<boolean>
	customRecordingPath: string | null
	setCustomRecordingPath: ModifyState<string | null>
	setLanguageDirections: () => void
	gpuDevice: number | null
	setGpuDevice: ModifyState<number | null>
}

const PreferenceContext = createContext<Preference | null>(null)

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
	sampling_strategy: 'greedy' | 'beam search'
	best_of?: number
	beam_size?: number
}

const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
const defaultDisplayLanguage = 'en-US'

const defaultOptions = {
	modelOptions: {
		init_prompt: '',
		verbose: false,
		lang: 'en',
		n_threads: 4,
		temperature: 0.4,
		max_text_ctx: undefined,
		word_timestamps: false,
		max_sentence_len: 1,
		sampling_strategy: 'beam search' as 'greedy' | 'beam search',
		best_of: 5,
		beam_size: 5,
	},
	storeRecordInDocuments: true,
}

export function PreferenceProvider({ children }: { children: ReactNode }) {
	const { i18n } = useTranslation()
	const previ18Language = useRef(i18n.language)
	const [language, setLanguage] = useLocalStorage('prefs_display_language', defaultDisplayLanguage)
	const [isFirstRun, setIsFirstRun] = useLocalStorage('prefs_first_localstorage_read', true)

	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const isMounted = useRef<boolean>(false)
	const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('prefs_theme', systemIsDark ? 'dark' : 'light')

	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', defaultOptions.modelOptions)
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', defaultOptions.storeRecordInDocuments)
	const [customRecordingPath, setCustomRecordingPath] = useLocalStorage<string | null>('prefs_custom_recording_path', null)
	const [gpuDevice, setGpuDevice] = useLocalStorage<number | null>('prefs_gpu_device', null)

	useEffect(() => {
		setIsFirstRun(false)
	}, [])

	useEffect(() => {
		if (theme === 'dark') {
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
		}
	}, [theme])

	function setLanguageDefaults() {
		const name = supportedLanguages[preference.displayLanguage]
		if (name) {
			preference.setModelOptions({ ...preference.modelOptions, lang: WhisperLanguages[name as keyof typeof WhisperLanguages] })
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

	useEffect(() => {
		if (!supportedLanguages[language]) {
			setLanguage('en-US')
		}
	}, [language, setLanguage])

	const preference: Preference = {
		setLanguageDirections: setLanguageDefaults,
		modelOptions,
		setModelOptions,
		storeRecordInDocuments,
		setStoreRecordInDocuments,
		customRecordingPath,
		setCustomRecordingPath,
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
