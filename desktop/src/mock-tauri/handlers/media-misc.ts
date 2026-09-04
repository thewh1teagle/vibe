import { emitMockEvent, onMockEvent } from '../event-bus'
import { APP_LOCAL_DATA, DOCUMENTS_FOLDER, HOME_FOLDER, virtualFs } from '../state'
import type { CommandHandlerMap } from '../types'

let tempPathCounter = 0

interface MockAudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
}

const MOCK_AUDIO_DEVICES: MockAudioDevice[] = [
	{ isDefault: true, isInput: true, id: 'mock-mic', name: 'Mock Microphone' },
	{ isDefault: true, isInput: false, id: 'mock-out', name: 'Mock Speakers' },
]

const RECORD_FINISH_DELAY_MS = 200
const RECORD_LEVEL_TICK_MS = 100
const YTDLP_TICKS = 20
const YTDLP_TICK_MS = 100

// Module-level mock state (survives across invokes for the lifetime of the page).
let dictationIndicatorEnabled = false
let meetingDetectionEnabled = false
let meetingPromptState: { source: 'meet' | 'zoom' | 'teams' } | null = null

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Fake speech envelope: two slow sines (syllables + phrase breathing) plus jitter, so the mock
 * meter moves like a voice instead of a metronome. Returns 0.05..0.9.
 */
function mockSpeechLevel(tick: number) {
	const syllables = 0.5 + 0.5 * Math.sin(tick * 0.55)
	const phrase = 0.55 + 0.45 * Math.sin(tick * 0.09 + 1.3)
	const jitter = Math.random() * 0.18
	const level = syllables * phrase * 0.8 + jitter
	return Math.min(0.9, Math.max(0.05, level))
}

function basename(path: string) {
	const normalized = path.replace(/\/+$/, '')
	return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function dirname(path: string) {
	const normalized = path.replace(/\/+$/, '')
	const index = normalized.lastIndexOf('/')
	return index <= 0 ? '/' : normalized.slice(0, index)
}

function stem(name: string) {
	const index = name.lastIndexOf('.')
	return index <= 0 ? name : name.slice(0, index)
}

function join(folder: string, name: string) {
	return `${folder.replace(/\/+$/, '')}/${name}`
}

export const mediaMiscHandlers: CommandHandlerMap = {
	// --- Audio devices / recording ---------------------------------------------

	get_audio_devices: () => MOCK_AUDIO_DEVICES,

	start_record: (args) => {
		console.info('[mock] start_record', args)
		const path = `${APP_LOCAL_DATA}/recording.wav`
		// Stand in for the capture callbacks: a level event every 100ms, like the throttled Rust side.
		let tick = 0
		const levelTimer = window.setInterval(() => {
			tick += 1
			emitMockEvent('record_level', mockSpeechLevel(tick))
		}, RECORD_LEVEL_TICK_MS)
		// The frontend stops recording by emitting `stop_record` on the event bus.
		const unsub = onMockEvent('stop_record', () => {
			unsub()
			window.clearInterval(levelTimer)
			setTimeout(() => {
				virtualFs.set(path, null)
				emitMockEvent('record_finish', { path, name: basename(path) })
			}, RECORD_FINISH_DELAY_MS)
		})
		// Resolve immediately, like the real command which spawns a background thread.
		return undefined
	},

	// --- Text injection ---------------------------------------------------------

	type_text: (args) => {
		console.info('[mock] type_text', args?.text)
	},

	// --- App / process misc -----------------------------------------------------

	get_argv: () => [] as string[],
	is_online: () => true,
	is_crashed_recently: () => false,
	rename_crash_file: () => undefined,

	// --- Paths / files ----------------------------------------------------------

	glob_files: (args) => {
		const folder = String(args?.folder ?? '')
		const patterns = Array.isArray(args?.patterns) ? (args.patterns as unknown[]).map(String) : []
		const recursive = Boolean(args?.recursive)
		const prefix = folder.replace(/\/+$/, '')

		return [...virtualFs.keys()].filter((path) => {
			if (!path.startsWith(`${prefix}/`)) return false
			if (!recursive && dirname(path) !== prefix) return false
			if (patterns.length === 0) return true
			return patterns.some((pattern) => {
				const ext = pattern.replace(/^\*?\.?/, '').toLowerCase()
				return path.toLowerCase().endsWith(`.${ext}`)
			})
		})
	},

	get_save_path: (args) => {
		const targetExt = String(args?.targetExt ?? 'txt')
		const name = `transcript.${targetExt}`
		return { name, path: `${DOCUMENTS_FOLDER}/${name}` }
	},

	// Mirrors the Rust impl: `<parent>/<stem><suffix>` (the suffix already carries the extension).
	get_path_dst: (args) => {
		const src = String(args?.src ?? '')
		const suffix = String(args?.suffix ?? '')
		return join(dirname(src), `${stem(basename(src))}${suffix}`)
	},

	get_default_projects_path: () => `${DOCUMENTS_FOLDER}/Vibe`,

	// Unique like the real one: several downloads in a row must not land on the same file.
	get_temp_path: (args) => `${APP_LOCAL_DATA}/tmp-${(tempPathCounter += 1)}.${String(args?.ext ?? 'tmp')}`,

	get_agent_paths: () => ({ sona: `${APP_LOCAL_DATA}/sona`, vibe: `${APP_LOCAL_DATA}/vibe` }),

	// Mirrors the Rust command: `<home>/.claude|.codex/skills/vibe/SKILL.md`, parents created.
	install_agent_skill: (args) => {
		const folder = String(args?.target ?? 'claude') === 'codex' ? '.codex' : '.claude'
		const path = `${HOME_FOLDER}/${folder}/skills/vibe/SKILL.md`
		virtualFs.set(path, String(args?.contents ?? ''))
		return path
	},

	// --- yt-dlp -----------------------------------------------------------------

	pick_media_paths: async () => null,

	set_tray: async () => null,

	download_audio: async (args) => {
		// A link with "fail" in it stands in for a site yt-dlp cannot fetch.
		if (String(args?.url ?? '').includes('fail')) throw new Error(`[mock] yt-dlp could not download ${String(args?.url)}`)
		const outPath = String(args?.outPath ?? `${APP_LOCAL_DATA}/tmp.m4a`)
		let cancelled = false
		const unsub = onMockEvent('ytdlp-cancel', () => {
			cancelled = true
		})
		try {
			for (let tick = 0; tick <= YTDLP_TICKS; tick += 1) {
				if (cancelled) {
					// The call site checks its own cancel ref after this resolves, so resolve
					// quietly instead of rejecting (a rejection would open the error modal).
					console.info('[mock] download_audio cancelled')
					return outPath
				}
				emitMockEvent('ytdlp-progress', (tick / YTDLP_TICKS) * 100)
				await sleep(YTDLP_TICK_MS)
			}
			virtualFs.set(outPath, null)
			return outPath
		} finally {
			unsub()
		}
	},

	get_latest_ytdlp_version: () => '2026.08.19',

	// --- Shell / system no-ops --------------------------------------------------

	open_path: (args) => {
		console.info('[mock] open_path', args?.path)
	},
	show_log_path: () => {
		console.info('[mock] show_log_path')
	},
	show_temp_path: () => {
		console.info('[mock] show_temp_path')
	},
	open_system_audio_settings: () => {
		console.info('[mock] open_system_audio_settings')
	},
	get_system_audio_permission_status: () => 'granted',
	request_system_audio_permission: () => 'granted',
	get_microphone_permission_status: () => 'granted',
	request_microphone_permission: () => 'granted',
	open_microphone_settings: () => {
		console.info('[mock] open_microphone_settings')
	},

	track_analytics_event: () => undefined,

	// --- Dictation indicator ----------------------------------------------------

	get_dictation_indicator_enabled: () => dictationIndicatorEnabled,
	set_dictation_indicator_enabled: (args) => {
		dictationIndicatorEnabled = Boolean(args?.enabled)
	},
	get_dictation_indicator_state: () => null,
	show_dictation_indicator: (args) => {
		emitMockEvent('dictation-indicator-state', args?.state)
	},
	hide_dictation_indicator: () => undefined,
	dictation_indicator_ready: () => undefined,

	// --- Meeting prompt ----------------------------------------------------------

	get_meeting_detection_enabled: () => meetingDetectionEnabled,
	set_meeting_detection_enabled: (args) => {
		meetingDetectionEnabled = Boolean(args?.enabled)
		if (!meetingDetectionEnabled) meetingPromptState = null
	},
	get_meeting_prompt_state: () => meetingPromptState,
	dismiss_meeting_prompt: () => {
		meetingPromptState = null
	},
	meeting_prompt_ready: () => undefined,
}
