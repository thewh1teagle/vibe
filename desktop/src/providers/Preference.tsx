import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { load } from '@tauri-apps/plugin-store'
import * as config from '~/lib/config'
import { TextFormat } from '~/components/FormatSelect'
import { ModifyState } from '~/lib/utils'
import { supportedLanguages } from '~/lib/i18n'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { useTranslation } from 'react-i18next'
import { defaultOllamaConfig, LlmConfig } from '~/lib/llm'
import { message } from '@tauri-apps/plugin-dialog'

type Direction = 'ltr' | 'rtl'
export type HomeTab = 'record' | 'file' | 'link'

export interface AdvancedTranscribeOptions {
	includeSubFolders: boolean
	skipIfExists: boolean
	saveNextToAudioFile: boolean
}

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
	textFormatTranscript: TextFormat
	setTextFormatTranscript: ModifyState<TextFormat>
	textFormatSummary: TextFormat
	setTextFormatSummary: ModifyState<TextFormat>
	modelOptions: ModelOptions
	setModelOptions: ModifyState<ModelOptions>
	theme: 'light' | 'dark'
	setTheme: ModifyState<'light' | 'dark'>
	storeRecordInDocuments: boolean
	setStoreRecordInDocuments: ModifyState<boolean>
	customRecordingPath: string | null
	setCustomRecordingPath: ModifyState<string | null>
	setLanguageDirections: () => void
	homeTab: HomeTab
	setHomeTab: ModifyState<HomeTab>

	llmConfig: LlmConfig
	setLlmConfig: ModifyState<LlmConfig>
	ffmpegOptions: FfmpegOptions
	setFfmpegOptions: ModifyState<FfmpegOptions>
	resetOptions: () => void
	enableSubtitlesPreset: () => void
	ytDlpVersion: string | null
	setYtDlpVersion: ModifyState<string | null>
	shouldCheckYtDlpVersion: boolean
	setShouldCheckYtDlpVersion: ModifyState<boolean>

	advancedTranscribeOptions: AdvancedTranscribeOptions
	setAdvancedTranscribeOptions: ModifyState<AdvancedTranscribeOptions>

	diarizeEnabled: boolean
	setDiarizeEnabled: ModifyState<boolean>
	stableTimestampsEnabled: boolean
	setStableTimestampsEnabled: ModifyState<boolean>

	gpuDevice: number | null
	setGpuDevice: ModifyState<number | null>

	recentLanguages: { code: string; ts: number }[]
	setRecentLanguages: ModifyState<{ code: string; ts: number }[]>

	analyticsEnabled: boolean
	setAnalyticsEnabled: (value: boolean) => void
}

// Create the context
const PreferenceContext = createContext<Preference | null>(null)

// Custom hook to use the preference context
export function usePreferenceProvider() {
	return useContext(PreferenceContext) as Preference
}

export interface FfmpegOptions {
	normalize_loudness: boolean
	custom_command: string | null
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
	soundOnFinish: true,
	focusOnFinish: true,
	modelPath: null,
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
	ffmpegOptions: {
		normalize_loudness: false,
		custom_command: null,
	},
	storeRecordInDocuments: true,
	llmConfig: defaultOllamaConfig(),
	ytDlpVersion: null,
	shouldCheckYtDlpVersion: true,
}

// Preference provider component
export function PreferenceProvider({ children }: { children: ReactNode }) {
	const { i18n } = useTranslation()
	const previ18Language = useRef(i18n.language)
	const [language, setLanguage] = useLocalStorage('prefs_display_language', defaultDisplayLanguage)
	const [isFirstRun, setIsFirstRun] = useLocalStorage('prefs_first_localstorage_read', true)

	const [modelPath, setModelPath] = useLocalStorage<string | null>('prefs_model_path', null)
	const [skippedSetup, setSkippedSetup] = useLocalStorage<boolean>('prefs_skipped_setup', false)
	const [textAreaDirection, setTextAreaDirection] = useLocalStorage<Direction>('prefs_textarea_direction', 'ltr')
	const [textFormatTranscript, setTextFormatTranscript] = useLocalStorage<TextFormat>('prefs_text_format_transcript', 'pdf')
	const [textFormatSummary, setTextFormatSummary] = useLocalStorage<TextFormat>('prefs_text_format_summary', 'md')
	const isMounted = useRef<boolean>(false)
	const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('prefs_theme', systemIsDark ? 'dark' : 'light')
	const [homeTab, setHomeTab] = useLocalStorage<HomeTab>('prefs_home_tab', 'file')

	const [soundOnFinish, setSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', defaultOptions.soundOnFinish)
	const [focusOnFinish, setFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', defaultOptions.focusOnFinish)
	const [modelOptions, setModelOptions] = useLocalStorage<ModelOptions>('prefs_modal_args', defaultOptions.modelOptions)
	const [ffmpegOptions, setFfmpegOptions] = useLocalStorage<FfmpegOptions>('prefs_ffmpeg_options', defaultOptions.ffmpegOptions)
	const [storeRecordInDocuments, setStoreRecordInDocuments] = useLocalStorage('prefs_store_record_in_documents', defaultOptions.storeRecordInDocuments)
	const [customRecordingPath, setCustomRecordingPath] = useLocalStorage<string | null>('prefs_custom_recording_path', null)
	const [llmConfig, setLlmConfig] = useLocalStorage<LlmConfig>('prefs_llm_config', defaultOptions.llmConfig)
	const [ytDlpVersion, setYtDlpVersion] = useLocalStorage<string | null>('prefs_ytdlp_version', null)
	const [shouldCheckYtDlpVersion, setShouldCheckYtDlpVersion] = useLocalStorage<boolean>('prefs_should_check_ytdlp_version', true)
	const [advancedTranscribeOptions, setAdvancedTranscribeOptions] = useLocalStorage<AdvancedTranscribeOptions>('prefs_advanced_transcribe_options', {
		includeSubFolders: false,
		saveNextToAudioFile: true,
		skipIfExists: true,
	})

	const [recentLanguages, setRecentLanguages] = useLocalStorage<{ code: string; ts: number }[]>('prefs_recent_languages', [])
	const [diarizeEnabled, setDiarizeEnabled] = useLocalStorage<boolean>('prefs_diarize_enabled', false)
	const [stableTimestampsEnabled, setStableTimestampsEnabled] = useLocalStorage<boolean>('prefs_stable_timestamps_enabled', false)
	const [gpuDevice, setGpuDevice] = useLocalStorage<number | null>('prefs_gpu_device', null)

	const [analyticsEnabled, setAnalyticsEnabledLocal] = useState(true)
	useEffect(() => {
		load(config.storeFilename).then((store) => {
			store.get<boolean>('analytics_enabled').then((val) => {
				if (val !== null && val !== undefined) {
					setAnalyticsEnabledLocal(val)
				}
			})
		})
	}, [])
	const setAnalyticsEnabled = async (value: boolean) => {
		setAnalyticsEnabledLocal(value)
		const store = await load(config.storeFilename)
		await store.set('analytics_enabled', value)
		await store.save()
	}

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

	useEffect(() => {
		if (!supportedLanguages[language]) {
			setLanguage('en-US')
		}
	}, [language, setLanguage])

	function resetOptions() {
		setSoundOnFinish(defaultOptions.soundOnFinish)
		setFocusOnFinish(defaultOptions.focusOnFinish)
		setModelOptions(defaultOptions.modelOptions)
		setFfmpegOptions(defaultOptions.ffmpegOptions)
		setStoreRecordInDocuments(defaultOptions.storeRecordInDocuments)
		setCustomRecordingPath(null)
		setLlmConfig(defaultOptions.llmConfig)
		message(i18n.t('common.success-action'))
	}

	function enableSubtitlesPreset() {
		setModelOptions({ ...preference.modelOptions, word_timestamps: true, max_sentence_len: 32 })
		setTextFormatTranscript('srt')
		message(i18n.t('common.success-action'))
	}

	const preference: Preference = {
		enableSubtitlesPreset,
		llmConfig,
		resetOptions,
		setLlmConfig,
		setLanguageDirections: setLanguageDefaults,
		modelOptions,
		setModelOptions,
		storeRecordInDocuments,
		setStoreRecordInDocuments,
		customRecordingPath,
		setCustomRecordingPath,
		textFormatTranscript,
		setTextFormatTranscript,
		textFormatSummary,
		setTextFormatSummary,
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
		homeTab,
		setHomeTab,
		ffmpegOptions,
		setFfmpegOptions,
		ytDlpVersion,
		setYtDlpVersion,
		shouldCheckYtDlpVersion,
		setShouldCheckYtDlpVersion,
		advancedTranscribeOptions,
		setAdvancedTranscribeOptions,
		recentLanguages,
		setRecentLanguages,
		diarizeEnabled,
		setDiarizeEnabled,
		stableTimestampsEnabled,
		setStableTimestampsEnabled,
		gpuDevice,
		setGpuDevice,
		analyticsEnabled,
		setAnalyticsEnabled,
	}

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
