// Core runtime of the browser-mode Tauri mock: installs the IPC bridge, the window/webview
// surface and the few globals the app touches directly.
import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { handleEventPluginCommand } from './event-bus'
import { mockArch, mockPlatform } from './state'
import type { CommandHandlerMap } from './types'

// Commands sent by `@tauri-apps/api/window`, `/webview` and `/webviewWindow`.
// The app only uses show/setFocus/unminimize plus window scoped `listen()`, so a
// silent success is enough for the whole surface.
const WINDOW_SURFACE_PREFIXES = ['plugin:window|', 'plugin:webview|', 'plugin:webview-window|']

interface RuntimeState {
	handlers: CommandHandlerMap
	installed: boolean
}

const STATE_KEY = '__vibeMockTauriRuntime__'

function getState(): RuntimeState {
	const holder = globalThis as typeof globalThis & { [STATE_KEY]?: RuntimeState }
	if (!holder[STATE_KEY]) {
		holder[STATE_KEY] = { handlers: {}, installed: false }
	}
	return holder[STATE_KEY]
}

// A ~1s silent 8-bit mono wav, so `new Audio(convertFileSrc(path))` loads and plays.
let silentAudioDataUri: string | null = null
function getSilentAudioDataUri(): string {
	if (silentAudioDataUri) {
		return silentAudioDataUri
	}
	const sampleRate = 8000
	const frames = sampleRate
	const bytes = new Uint8Array(44 + frames)
	const view = new DataView(bytes.buffer)
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i += 1) {
			view.setUint8(offset + i, text.charCodeAt(i))
		}
	}
	ascii(0, 'RIFF')
	view.setUint32(4, 36 + frames, true)
	ascii(8, 'WAVE')
	ascii(12, 'fmt ')
	view.setUint32(16, 16, true) // fmt chunk size
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate, true) // byte rate
	view.setUint16(32, 1, true) // block align
	view.setUint16(34, 8, true) // bits per sample
	ascii(36, 'data')
	view.setUint32(40, frames, true)
	bytes.fill(128, 44) // 8-bit PCM silence

	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	silentAudioDataUri = `data:audio/wav;base64,${btoa(binary)}`
	return silentAudioDataUri
}

function isWindowSurfaceCommand(cmd: string): boolean {
	return WINDOW_SURFACE_PREFIXES.some((prefix) => cmd.startsWith(prefix))
}

async function route(cmd: string, args: Record<string, unknown>): Promise<unknown> {
	if (cmd.startsWith('plugin:event|')) {
		return handleEventPluginCommand(cmd, args)
	}

	const handler = getState().handlers[cmd]
	if (handler) {
		return handler(args)
	}

	if (isWindowSurfaceCommand(cmd)) {
		return null
	}

	console.warn('[mock-tauri] unhandled command', cmd, args)
	throw `[mock-tauri] unhandled command: ${cmd}`
}

// `@tauri-apps/plugin-os` reads these synchronously at import time (see src/lib/ytdlp.ts).
function installOsPluginInternals(): void {
	const target = window as Window & { __TAURI_OS_PLUGIN_INTERNALS__?: unknown }
	target.__TAURI_OS_PLUGIN_INTERNALS__ = {
		eol: '\n',
		os_type: mockPlatform,
		platform: mockPlatform,
		family: 'unix',
		version: '15.0.0',
		arch: mockArch,
		exe_extension: '',
	}
}

// `BoundaryFallback` reaches for the global bundle directly, without the guard the rest
// of the app uses, so it has to exist even in browser mode.
function installGlobalTauri(): void {
	const target = window as Window & { __TAURI__?: Record<string, unknown> }
	const currentWebviewWindow = {
		label: 'main',
		show: async () => {},
		hide: async () => {},
		setFocus: async () => {},
		unminimize: async () => {},
	}
	target.__TAURI__ = {
		...target.__TAURI__,
		webviewWindow: {
			getCurrentWebviewWindow: () => currentWebviewWindow,
		},
	}
}

export function installRuntime(handlers: CommandHandlerMap): void {
	const state = getState()
	// Always refresh the map so an HMR reload picks up edited handlers.
	state.handlers = handlers
	if (state.installed) {
		return
	}
	state.installed = true

	mockWindows('main')
	mockConvertFileSrc(mockPlatform)
	// There is no asset server in browser mode: every file resolves to playable silence.
	const internals = window as Window & {
		__TAURI_INTERNALS__?: { convertFileSrc?: (filePath: string, protocol?: string) => string }
	}
	if (internals.__TAURI_INTERNALS__) {
		internals.__TAURI_INTERNALS__.convertFileSrc = () => getSilentAudioDataUri()
	}

	mockIPC(async (cmd, args) => route(cmd, (args ?? {}) as Record<string, unknown>))

	// mockIPC drops the third invoke argument, but plugin-fs writes carry their target path in
	// its `headers` and send the file contents as a raw (non-record) payload. Re-wrap the real
	// internals.invoke so headers and raw bodies reach the handlers as `__headers`/`__body`.
	const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: { invoke?: (...args: unknown[]) => Promise<unknown> } }).__TAURI_INTERNALS__
	const baseInvoke = tauriInternals?.invoke
	if (tauriInternals && baseInvoke) {
		tauriInternals.invoke = (cmd: unknown, payload?: unknown, options?: unknown) => {
			const headers = (options as { headers?: Record<string, unknown> } | undefined)?.headers
			if (headers) {
				const record =
					payload && typeof payload === 'object' && !ArrayBuffer.isView(payload) && !(payload instanceof ArrayBuffer) ? payload : { __body: payload }
				payload = { ...(record as Record<string, unknown>), __headers: headers }
			}
			return baseInvoke.call(tauriInternals, cmd, payload, options)
		}
	}

	installOsPluginInternals()
	installGlobalTauri()
	installMockToolbar()
}

// Tiny floating control for mock-only knobs. Plain DOM so it never touches app code.
function installMockToolbar(): void {
	const ID = '__vibe-mock-toolbar'
	if (document.getElementById(ID)) {
		return
	}
	const label = () => (localStorage.getItem('mock-dialog-multi') === 'off' ? 'mock: pick 1 file' : 'mock: pick 3 files')
	const button = document.createElement('button')
	button.id = ID
	button.type = 'button'
	button.textContent = label()
	button.title = 'Browser mock: toggle how many files the fake open-dialog returns'
	button.style.cssText =
		'position:fixed;bottom:10px;left:10px;z-index:99999;padding:4px 10px;border-radius:999px;' +
		'border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.12);color:inherit;' +
		'font:11px/1.6 ui-monospace,monospace;opacity:.55;cursor:pointer;backdrop-filter:blur(4px)'
	button.addEventListener('mouseenter', () => (button.style.opacity = '1'))
	button.addEventListener('mouseleave', () => (button.style.opacity = '.55'))
	button.addEventListener('click', () => {
		localStorage.setItem('mock-dialog-multi', localStorage.getItem('mock-dialog-multi') === 'off' ? 'on' : 'off')
		button.textContent = label()
	})
	const mount = () => document.body.appendChild(button)
	if (document.body) {
		mount()
	} else {
		window.addEventListener('DOMContentLoaded', mount, { once: true })
	}
}
