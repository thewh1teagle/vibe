import { ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { ModifyState } from '~/lib/types'
import { ModelPresetId, defaultModelPresetId, PREF_KEY_MODEL_PATH } from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { useTranslation } from 'react-i18next'

export type TranscriptionProvider = 'local' | 'groq'

export interface Preference {
	displayLanguage: string
	setDisplayLanguage: ModifyState<string>
	soundOnFinish: boolean
	setSoundOnFinish: ModifyState<boolean>
	focusOnFinish: boolean
	setFocusOnFinish: ModifyState<boolean>
	modelPath: string | null
	setModelPath: ModifyState<string | null>
	selectedModelPreset: ModelPresetId
	setSelectedModelPreset: ModifyState<ModelPresetId>
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
	rawOutput: boolean
	setRawOutput: ModifyState<boolean>
	transcriptionProvider: TranscriptionProvider
	setTranscriptionProvider: ModifyState<TranscriptionProvider>
	groqApiKey: string
	setGroqApiKey: ModifyState<string>
	llmCleanup: boolean
	setLlmCleanup: ModifyState<boolean>
}

const PreferenceContext = createContext<Preference | null>(null)

export function usePreferenceProvider() {
	const ctx = useContext(PreferenceContext)
	if (!ctx) throw new Error('usePreferenceProvider must be used within PreferenceProvider')
	return ctx
}

export interface ModelOptions {
	lang: string
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

const defaultDisplayLanguage = 'en-US'

const defaultOptions = {
	modelOptions: {
		init_prompt: '',
		lang: 'auto',
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
	const [modelPath, setModelPath] = useLocalStorage<string | null>(PREF_KEY_MODEL_PATH, null)
	const [selectedModelPreset, setSelectedModelPreset] = useLocalStorage<ModelPresetId>('prefs_model_preset', defaultModelPresetId)
	const isMounted = useRef<boolean>(false)
	const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('prefs_theme', 'dark')

	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', defaultOptions.modelOptions)
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', defaultOptions.storeRecordInDocuments)
	const [customRecordingPath, setCustomRecordingPath] = useLocalStorage<string | null>('prefs_custom_recording_path', null)
	const [gpuDevice, setGpuDevice] = useLocalStorage<number | null>('prefs_gpu_device', null)
	const [rawOutput, setRawOutput] = useLocalStorage<boolean>('prefs_raw_output', false)
	const [transcriptionProvider, setTranscriptionProvider] = useLocalStorage<TranscriptionProvider>('prefs_transcription_provider', 'local')
	const [groqApiKey, setGroqApiKey] = useLocalStorage<string>('prefs_groq_api_key', '')
	const [llmCleanup, setLlmCleanup] = useLocalStorage<boolean>('prefs_llm_cleanup', false)

	useEffect(() => {
		if (theme === 'dark') {
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
		}
	}, [theme])

	function setLanguageDefaults() {
		const name = supportedLanguages[language]
		if (name) {
			setModelOptions({ ...modelOptions, lang: WhisperLanguages[name as keyof typeof WhisperLanguages] })
		}
	}

	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true
			return
		}
		if (previ18Language.current != i18n.language) {
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

	const preference: Preference = useMemo(
		() => ({
			setLanguageDirections: setLanguageDefaults,
			modelOptions,
			setModelOptions,
			storeRecordInDocuments,
			setStoreRecordInDocuments,
			customRecordingPath,
			setCustomRecordingPath,
			displayLanguage: language,
			setDisplayLanguage: setLanguage,
			soundOnFinish,
			setSoundOnFinish,
			focusOnFinish,
			setFocusOnFinish,
			modelPath,
			setModelPath,
			selectedModelPreset,
			setSelectedModelPreset,
			theme,
			setTheme,
			gpuDevice,
			setGpuDevice,
			rawOutput,
			setRawOutput,
			transcriptionProvider,
			setTranscriptionProvider,
			groqApiKey,
			setGroqApiKey,
			llmCleanup,
			setLlmCleanup,
		}),
		[
			language,
			modelPath,
			selectedModelPreset,
			modelOptions,
			theme,
			soundOnFinish,
			focusOnFinish,
			storeRecordInDocuments,
			customRecordingPath,
			gpuDevice,
			rawOutput,
			transcriptionProvider,
			groqApiKey,
			llmCleanup,
			setLanguage,
			setModelPath,
			setSelectedModelPreset,
			setModelOptions,
			setTheme,
			setSoundOnFinish,
			setFocusOnFinish,
			setStoreRecordInDocuments,
			setCustomRecordingPath,
			setGpuDevice,
			setRawOutput,
			setTranscriptionProvider,
			setGroqApiKey,
			setLanguageDefaults,
		],
	)

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
