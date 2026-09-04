import { ReactNode, SetStateAction, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { load } from '@tauri-apps/plugin-store'
import * as config from '~/lib/config'
import { DEFAULT_AUTO_EXPORT, type AutoExportSettings } from '~/lib/auto-export'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { KEEP_AWAKE, startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { usePersisted } from '~/lib/config-store'
import { TextFormat } from '~/components/format-select'
import { ModifyState } from '~/lib/types'
import { supportedLanguages } from '~/lib/i18n'
import { getLocale, getTextDirection, setLocale } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'
import { DEFAULT_AI, migrateLegacy, type AiSettings } from '~/lib/ai'
import { readConfig } from '~/lib/config-store'
import { message } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import type { ModelMetadata } from '~/lib/model'

type Direction = 'ltr' | 'rtl'
export type HomeTab = 'record' | 'file' | 'link'

/** What the export dialog remembers between openings. Direction is deliberately not here: it is a
 * one-off override that starts from the transcript's own direction each time. */
export interface ExportOptions {
	format: TextFormat
	content: 'transcript' | 'summary' | 'both'
	/** Appearance of the exported file, kept apart from the app's own theme — a file gets printed. */
	theme: 'light' | 'dark'
	showTimestamps: boolean
	showSpeakers: boolean
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
	format: 'pdf',
	content: 'transcript',
	theme: 'light',
	showTimestamps: false,
	showSpeakers: true,
}

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
	modelMetadata: ModelMetadata | null
	setModelMetadata: ModifyState<ModelMetadata | null>
	modelDisplayNames: Record<string, string>
	setModelDisplayNames: ModifyState<Record<string, string>>
	skippedSetup: boolean
	setSkippedSetup: ModifyState<boolean>
	closeToTray: boolean
	setCloseToTray: ModifyState<boolean>
	preventSleep: boolean
	setPreventSleep: ModifyState<boolean>
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
	projectsPath: string | null
	setProjectsPath: ModifyState<string | null>
	setLanguageDirections: () => void
	homeTab: HomeTab
	setHomeTab: ModifyState<HomeTab>

	ai: AiSettings
	setAi: ModifyState<AiSettings>
	ffmpegOptions: FfmpegOptions
	setFfmpegOptions: ModifyState<FfmpegOptions>
	resetOptions: () => void
	enableSubtitlesPreset: () => void
	ytDlpVersion: string | null
	setYtDlpVersion: ModifyState<string | null>
	shouldCheckYtDlpVersion: boolean
	setShouldCheckYtDlpVersion: ModifyState<boolean>
	ytDlpLastUpdateCheck: number
	setYtDlpLastUpdateCheck: ModifyState<number>
	ytDlpDeclinedVersion: string | null
	setYtDlpDeclinedVersion: ModifyState<string | null>

	advancedTranscribeOptions: AdvancedTranscribeOptions
	setAdvancedTranscribeOptions: ModifyState<AdvancedTranscribeOptions>

	diarizeEnabled: boolean
	setDiarizeEnabled: ModifyState<boolean>
	stableTimestampsEnabled: boolean
	setStableTimestampsEnabled: ModifyState<boolean>

	/** Everything the export dialog remembers, kept together under one config key. */
	exportOptions: ExportOptions
	setExportOptions: ModifyState<ExportOptions>
	autoExport: AutoExportSettings
	setAutoExport: ModifyState<AutoExportSettings>

	gpuDevice: number | null
	setGpuDevice: ModifyState<number | null>
	/** Transcribe on the CPU even where a GPU is available. */
	noGpu: boolean
	setNoGpu: ModifyState<boolean>
	unloadTimeoutMinutes: number
	setUnloadTimeoutMinutes: ModifyState<number>

	recentLanguages: { code: string; ts: number }[]
	setRecentLanguages: ModifyState<{ code: string; ts: number }[]>

	analyticsEnabled: boolean
	setAnalyticsEnabled: (value: boolean) => void

	/** Auto-save every finished transcription into the projects folder (powers the Recents sidebar). */
	saveTranscripts: boolean
	setSaveTranscripts: ModifyState<boolean>
	/** Offer to start recording when a supported meeting app begins using the microphone. */
	meetingDetectionEnabled: boolean
	setMeetingDetectionEnabled: ModifyState<boolean>
	autoTranscribeAfterRecording: boolean
	setAutoTranscribeAfterRecording: ModifyState<boolean>
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
		max_sentence_len: undefined,
		sampling_strategy: 'beam search' as 'greedy' | 'beam search',
		best_of: 5,
		beam_size: 5,
	},
	ffmpegOptions: {
		normalize_loudness: false,
		custom_command: null,
	},
	ytDlpVersion: null,
	shouldCheckYtDlpVersion: true,
}

// Preference provider component
export function PreferenceProvider({ children }: { children: ReactNode }) {
	const previousLanguage = useRef(getLocale())
	const [language, setLanguage] = usePersisted(CONFIG_KEYS.displayLanguage, defaultDisplayLanguage)
	const [isFirstRun, setIsFirstRun] = usePersisted(CONFIG_KEYS.firstRun, true)

	const [modelPath, setModelPath] = usePersisted<string | null>(CONFIG_KEYS.modelPath, null)
	const [modelMetadata, setModelMetadata] = useState<ModelMetadata | null>(null)
	const [modelDisplayNames, setModelDisplayNames] = usePersisted<Record<string, string>>(CONFIG_KEYS.modelDisplayNames, {})
	const [skippedSetup, setSkippedSetup] = usePersisted<boolean>(CONFIG_KEYS.skippedSetup, false)
	// Opt-in: a tray icon nobody asked for is clutter, and quitting from the X is what people expect.
	const [closeToTray, setCloseToTray] = usePersisted<boolean>(CONFIG_KEYS.closeToTray, false)
	// Off by default: holding a laptop awake around the clock is not something to opt someone into.
	const [preventSleep, setPreventSleep] = usePersisted<boolean>(CONFIG_KEYS.preventSleep, false)
	const [textAreaDirection, setTextAreaDirection] = usePersisted<Direction>(CONFIG_KEYS.textAreaDirection, 'ltr')
	const [textFormatTranscript, setTextFormatTranscript] = usePersisted<TextFormat>(CONFIG_KEYS.textFormatTranscript, 'pdf')
	const [textFormatSummary, setTextFormatSummary] = usePersisted<TextFormat>(CONFIG_KEYS.textFormatSummary, 'md')
	const isMounted = useRef<boolean>(false)
	const [theme, setTheme] = usePersisted<'dark' | 'light'>(CONFIG_KEYS.theme, systemIsDark ? 'dark' : 'light')
	const [homeTab, setHomeTab] = usePersisted<HomeTab>(CONFIG_KEYS.homeTab, 'file')

	const [soundOnFinish, setSoundOnFinish] = usePersisted(CONFIG_KEYS.soundOnFinish, defaultOptions.soundOnFinish)
	const [focusOnFinish, setFocusOnFinish] = usePersisted(CONFIG_KEYS.focusOnFinish, defaultOptions.focusOnFinish)
	const [modelOptions, setModelOptions] = usePersisted<ModelOptions>(CONFIG_KEYS.modelOptions, defaultOptions.modelOptions)
	const [ffmpegOptions, setFfmpegOptions] = usePersisted<FfmpegOptions>(CONFIG_KEYS.ffmpegOptions, defaultOptions.ffmpegOptions)
	const [projectsPath, setProjectsPath] = usePersisted<string | null>(CONFIG_KEYS.projectsPath, null)
	const [autoExport, setAutoExport] = usePersisted<AutoExportSettings>(CONFIG_KEYS.autoExport, DEFAULT_AUTO_EXPORT)
	// The pre-3.2 `summarize.llm` object is read once when `ai` is missing, so nobody loses a key or a prompt.
	const [ai, setAi] = usePersisted<AiSettings>(
		CONFIG_KEYS.ai,
		useMemo(
			() =>
				migrateLegacy(
					readConfig(CONFIG_KEYS.legacyLlmConfig, null),
					readConfig(CONFIG_KEYS.legacyAutoSummarizeOnFinish, config.defaultAutoSummarizeOnFinish),
				),
			[],
		),
	)
	useEffect(() => {
		// Once, at boot: writes the migrated shape so the file carries it from now on.
		if (readConfig(CONFIG_KEYS.ai, null) === null && readConfig(CONFIG_KEYS.legacyLlmConfig, null) !== null) setAi(ai)
	}, [ai, setAi])
	const [ytDlpVersion, setYtDlpVersion] = usePersisted<string | null>(CONFIG_KEYS.ytDlpVersion, null)
	const [shouldCheckYtDlpVersion, setShouldCheckYtDlpVersion] = usePersisted<boolean>(CONFIG_KEYS.shouldCheckYtDlpVersion, true)
	const [ytDlpLastUpdateCheck, setYtDlpLastUpdateCheck] = usePersisted<number>(CONFIG_KEYS.ytDlpLastUpdateCheck, 0)
	const [ytDlpDeclinedVersion, setYtDlpDeclinedVersion] = usePersisted<string | null>(CONFIG_KEYS.ytDlpDeclinedVersion, null)
	const [advancedTranscribeOptions, setAdvancedTranscribeOptions] = usePersisted<AdvancedTranscribeOptions>(CONFIG_KEYS.advancedOptions, {
		includeSubFolders: false,
		saveNextToAudioFile: true,
		skipIfExists: true,
	})

	const [recentLanguages, setRecentLanguages] = usePersisted<{ code: string; ts: number }[]>(CONFIG_KEYS.recentLanguages, [])
	const [diarizeEnabled, setDiarizeEnabled] = usePersisted<boolean>(CONFIG_KEYS.diarizeEnabled, false)
	const [stableTimestampsEnabled, setStableTimestampsEnabled] = usePersisted<boolean>(CONFIG_KEYS.stableTimestampsEnabled, false)
	const [storedExportOptions, setStoredExportOptions] = usePersisted<Partial<ExportOptions>>(CONFIG_KEYS.exportOptions, DEFAULT_EXPORT_OPTIONS)
	// One key holding several settings can be half-written by an older build or a hand-edited
	// config, and a missing field would reach the exporter as `undefined`. Defaults fill the gaps,
	// on the way in and on the way back out.
	const exportOptions = useMemo<ExportOptions>(() => ({ ...DEFAULT_EXPORT_OPTIONS, ...storedExportOptions }), [storedExportOptions])
	const setExportOptions: ModifyState<ExportOptions> = useCallback(
		(value) => {
			setStoredExportOptions((previous) => {
				const current = { ...DEFAULT_EXPORT_OPTIONS, ...previous }
				return typeof value === 'function' ? (value as (state: ExportOptions) => ExportOptions)(current) : value
			})
		},
		[setStoredExportOptions],
	)
	const [gpuDevice, setGpuDevice] = usePersisted<number | null>(CONFIG_KEYS.gpuDevice, null)
	const [noGpu, setNoGpu] = usePersisted<boolean>(CONFIG_KEYS.noGpu, false)
	const [unloadTimeoutMinutes, setUnloadTimeoutMinutes] = usePersisted<number>(CONFIG_KEYS.unloadTimeoutMinutes, 5)
	const [saveTranscripts, setSaveTranscripts] = usePersisted<boolean>(CONFIG_KEYS.saveTranscripts, true)
	const [meetingDetectionEnabled, setMeetingDetectionEnabled] = usePersisted<boolean>(CONFIG_KEYS.meetingDetectionEnabled, false)
	const [autoTranscribeAfterRecording, setAutoTranscribeAfterRecording] = usePersisted<boolean>(CONFIG_KEYS.autoTranscribeAfterRecording, false)

	const [analyticsEnabled, setAnalyticsEnabledLocal] = useState(true)

	/**
	 * The background hold: idle only, never the display. It exists so the app stays
	 * reachable while it sits in the tray — most of all for phone handoff, where the
	 * machine sleeping takes the endpoint down and the phone finds nothing to talk to.
	 * Keeping the screen lit for that would be plainly wrong.
	 */
	useEffect(() => {
		if (!preventSleep) {
			stopKeepAwake(KEEP_AWAKE.background)
			return
		}
		startKeepAwake(KEEP_AWAKE.background, { idle: true })
		return () => {
			stopKeepAwake(KEEP_AWAKE.background)
		}
	}, [preventSleep])

	useEffect(() => {
		if (!modelPath) {
			setModelMetadata(null)
			return
		}
		invoke<ModelMetadata>('get_model_metadata', { modelPath })
			.then(setModelMetadata)
			.catch((error) => {
				console.error('failed to read model metadata:', error)
				setModelMetadata(null)
			})
	}, [modelPath])

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
		// Keep the native window appearance in sync so macOS vibrancy (glass sidebar)
		// renders light glass in light mode instead of the system appearance.
		try {
			void getCurrentWebviewWindow().setTheme(theme)
		} catch {
			/* browser mode */
		}
	}, [theme])

	function setLanguageDefaults() {
		if (supportedLanguages[preference.displayLanguage]) {
			preference.setModelOptions({ ...preference.modelOptions, lang: preference.displayLanguage.split('-')[0].toLowerCase() })
			preference.setTextAreaDirection(getTextDirection())
		}
	}
	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true
			return
		}
		if (previousLanguage.current !== getLocale() || isFirstRun) {
			previousLanguage.current = getLocale()
			setLanguageDefaults()
		}
	}, [language, isFirstRun])

	function setDisplayLanguage(nextLanguage: SetStateAction<string>) {
		const resolvedLanguage = typeof nextLanguage === 'function' ? nextLanguage(language) : nextLanguage
		if (!supportedLanguages[resolvedLanguage]) return
		if (resolvedLanguage !== getLocale()) setLocale(resolvedLanguage as never, { reload: false })
		setLanguage(resolvedLanguage)
	}

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
		setProjectsPath(null)
		setAi(DEFAULT_AI)
		setMeetingDetectionEnabled(false)
		setAutoTranscribeAfterRecording(false)
		message(m.successAction())
	}

	function enableSubtitlesPreset() {
		setModelOptions({ ...preference.modelOptions, word_timestamps: true, max_sentence_len: 32 })
		setTextFormatTranscript('srt')
		message(m.successAction())
	}

	const preference: Preference = {
		enableSubtitlesPreset,
		ai,
		setAi,
		resetOptions,
		setLanguageDirections: setLanguageDefaults,
		modelOptions,
		setModelOptions,
		projectsPath,
		setProjectsPath,
		textFormatTranscript,
		setTextFormatTranscript,
		textFormatSummary,
		setTextFormatSummary,
		textAreaDirection,
		setTextAreaDirection,
		skippedSetup,
		setSkippedSetup,
		closeToTray,
		setCloseToTray,
		preventSleep,
		setPreventSleep,
		displayLanguage: language,
		setDisplayLanguage,
		soundOnFinish,
		setSoundOnFinish,
		focusOnFinish,
		setFocusOnFinish,
		modelPath,
		setModelPath,
		modelMetadata,
		setModelMetadata,
		modelDisplayNames,
		setModelDisplayNames,
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
		ytDlpLastUpdateCheck,
		setYtDlpLastUpdateCheck,
		ytDlpDeclinedVersion,
		setYtDlpDeclinedVersion,
		autoExport,
		setAutoExport,
		advancedTranscribeOptions,
		setAdvancedTranscribeOptions,
		recentLanguages,
		setRecentLanguages,
		diarizeEnabled,
		setDiarizeEnabled,
		stableTimestampsEnabled,
		setStableTimestampsEnabled,
		exportOptions,
		setExportOptions,
		gpuDevice,
		noGpu,
		setNoGpu,
		setGpuDevice,
		unloadTimeoutMinutes,
		setUnloadTimeoutMinutes,
		analyticsEnabled,
		setAnalyticsEnabled,
		saveTranscripts,
		setSaveTranscripts,
		meetingDetectionEnabled,
		setMeetingDetectionEnabled,
		autoTranscribeAfterRecording,
		setAutoTranscribeAfterRecording,
	}

	return <PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider>
}
