/**
 * Every setting Vibe persists, as one flat, human-readable key.
 *
 * The values are the field names inside `app_config.json`: the file is meant to be read and edited
 * by hand (and by agents), so the names describe the setting rather than the code that reads it.
 * Never rename a released key without adding a migration — see `lib/migrations`.
 */
export const CONFIG_KEYS = {
	// General
	displayLanguage: 'general.displayLanguage',
	theme: 'general.theme',
	firstRun: 'general.firstRun',
	skippedSetup: 'general.skippedSetup',
	closeToTray: 'general.closeToTray',
	preventSleep: 'general.preventSleep',
	analyticsEnabled: 'analytics_enabled',
	/** Set once the machine has reported it has no AVX2, so the event counts machines, not attempts. */
	avx2NotSupportedReported: 'analytics.avx2NotSupportedReported',

	// Model
	modelPath: 'model.path',
	modelDisplayNames: 'model.displayNames',
	gpuDevice: 'model.gpuDevice',
	unloadTimeoutMinutes: 'model.unloadTimeoutMinutes',
	modelPromptDismissed: 'model.downloadPromptDismissed',

	// Transcription
	modelOptions: 'transcription.modelOptions',
	ffmpegOptions: 'transcription.ffmpegOptions',
	advancedOptions: 'transcription.advancedOptions',
	recentLanguages: 'transcription.recentLanguages',
	diarizeEnabled: 'transcription.recognizeSpeakers',
	stableTimestampsEnabled: 'transcription.stableTimestamps',
	soundOnFinish: 'transcription.soundOnFinish',
	focusOnFinish: 'transcription.focusOnFinish',
	saveTranscripts: 'transcription.saveTranscripts',

	// Recording
	storeRecordInDocuments: 'recording.storeInDocuments',
	customRecordingPath: 'recording.customPath',
	inputDeviceId: 'recording.inputDeviceId',
	outputDeviceId: 'recording.outputDeviceId',

	// Reading the transcript
	textAreaDirection: 'transcript.textDirection',
	textSize: 'transcript.textSize',
	showTimestamps: 'transcript.showTimestamps',
	showSpeakers: 'transcript.showSpeakers',
	textFormatTranscript: 'transcript.exportFormat',
	textFormatSummary: 'transcript.summaryExportFormat',
	transcriptTab: 'transcript.tab',

	// Playback
	playbackRate: 'player.playbackRate',

	// Global dictation
	hotkeyEnabled: 'dictation.enabled',
	hotkeyShortcut: 'dictation.shortcut',
	hotkeyOutputMode: 'dictation.outputMode',
	hotkeyActivationMode: 'dictation.activationMode',
	hotkeyNormalizeOutput: 'dictation.normalizeOutput',

	// AI summaries
	llmConfig: 'summarize.llm',

	// Local API. Written by the app while the server runs so agents can find the per-run port;
	// removed on stop and on exit. Not a user setting.
	apiBaseUrl: 'api.baseUrl',

	// Tools
	ytDlpVersion: 'tools.ytDlpVersion',
	shouldCheckYtDlpVersion: 'tools.checkYtDlpUpdates',
	/** Epoch ms of the last GitHub release lookup, so the check runs weekly instead of every launch. */
	ytDlpLastUpdateCheck: 'tools.ytDlpLastUpdateCheck',
	/** The newest version the user said "later" to — never offered again, only something newer is. */
	ytDlpDeclinedVersion: 'tools.ytDlpDeclinedVersion',

	// UI state that is remembered but not really a setting
	homeTab: 'ui.homeTab',
} as const

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS]

/**
 * Where each setting used to live in `localStorage`. Used once, by the migration that moves an
 * existing install into the config file; new code only ever uses `CONFIG_KEYS`.
 */
export const LEGACY_LOCAL_STORAGE_KEYS: Record<string, ConfigKey> = {
	prefs_display_language: CONFIG_KEYS.displayLanguage,
	prefs_theme: CONFIG_KEYS.theme,
	prefs_first_localstorage_read: CONFIG_KEYS.firstRun,
	prefs_skipped_setup: CONFIG_KEYS.skippedSetup,
	prefs_model_path: CONFIG_KEYS.modelPath,
	prefs_model_display_names: CONFIG_KEYS.modelDisplayNames,
	prefs_gpu_device: CONFIG_KEYS.gpuDevice,
	prefs_unload_timeout_minutes: CONFIG_KEYS.unloadTimeoutMinutes,
	'vibe:model-download-prompt-dismissed': CONFIG_KEYS.modelPromptDismissed,
	prefs_modal_args: CONFIG_KEYS.modelOptions,
	prefs_ffmpeg_options: CONFIG_KEYS.ffmpegOptions,
	prefs_advanced_transcribe_options: CONFIG_KEYS.advancedOptions,
	prefs_recent_languages: CONFIG_KEYS.recentLanguages,
	prefs_diarize_enabled: CONFIG_KEYS.diarizeEnabled,
	prefs_stable_timestamps_enabled: CONFIG_KEYS.stableTimestampsEnabled,
	prefs_sound_on_finish: CONFIG_KEYS.soundOnFinish,
	prefs_focus_on_finish: CONFIG_KEYS.focusOnFinish,
	prefs_save_transcripts: CONFIG_KEYS.saveTranscripts,
	prefs_store_record_in_documents: CONFIG_KEYS.storeRecordInDocuments,
	prefs_custom_recording_path: CONFIG_KEYS.customRecordingPath,
	prefs_input_device_id: CONFIG_KEYS.inputDeviceId,
	prefs_output_device_id: CONFIG_KEYS.outputDeviceId,
	prefs_textarea_direction: CONFIG_KEYS.textAreaDirection,
	prefs_transcript_text_size: CONFIG_KEYS.textSize,
	prefs_transcript_show_timestamps: CONFIG_KEYS.showTimestamps,
	prefs_transcript_show_speakers: CONFIG_KEYS.showSpeakers,
	prefs_text_format_transcript: CONFIG_KEYS.textFormatTranscript,
	prefs_text_format_summary: CONFIG_KEYS.textFormatSummary,
	prefs_transcript_tab: CONFIG_KEYS.transcriptTab,
	prefs_hotkey_enabled: CONFIG_KEYS.hotkeyEnabled,
	prefs_hotkey_shortcut: CONFIG_KEYS.hotkeyShortcut,
	prefs_hotkey_output_mode: CONFIG_KEYS.hotkeyOutputMode,
	prefs_hotkey_activation_mode: CONFIG_KEYS.hotkeyActivationMode,
	prefs_hotkey_normalize_output: CONFIG_KEYS.hotkeyNormalizeOutput,
	prefs_llm_config: CONFIG_KEYS.llmConfig,
	prefs_ytdlp_version: CONFIG_KEYS.ytDlpVersion,
	prefs_should_check_ytdlp_version: CONFIG_KEYS.shouldCheckYtDlpVersion,
	prefs_home_tab: CONFIG_KEYS.homeTab,
}
