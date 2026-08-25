// Browser-mode mocks for every `plugin:<name>|<command>` the app reaches through
// the official @tauri-apps plugin JS. Command names, argument shapes and return
// shapes are taken from each plugin's `dist-js/index.js`.
import { emitMockEvent } from '../event-bus'
import { APP_LOCAL_DATA, DOCUMENTS_FOLDER, appName, appVersion, mockPlatform, virtualFs } from '../state'
import type { CommandHandlerMap } from '../types'
import { httpHandlers } from './plugins-http'

// --- shared helpers -------------------------------------------------------

function toPosixPath(value: unknown): string {
	let path = String(value ?? '')
	if (path.startsWith('file://')) {
		path = decodeURIComponent(path.slice('file://'.length))
	}
	path = path.replace(/\\/g, '/')
	// Relative paths only show up together with a `baseDir` option; anchor them somewhere real.
	return path.startsWith('/') ? path : `${APP_LOCAL_DATA}/${path}`.replace(/\/+/g, '/')
}

function isDirPath(path: string): boolean {
	const prefix = `${path}/`
	for (const key of virtualFs.keys()) {
		if (key.startsWith(prefix)) {
			return true
		}
	}
	return false
}

function pathExists(path: string): boolean {
	return virtualFs.has(path) || isDirPath(path)
}

// Last path handed out by `plugin:dialog|save`; used as the write target when the
// invoke headers are unavailable (see `resolveWritePath`).
let lastSavePath: string | null = null

/**
 * `fs.writeFile` / `fs.writeTextFile` send the bytes as the raw invoke payload and put the
 * target path in the invoke *headers*, so the args are not a plain record. `mockIPC` drops
 * those headers, so accept every shape a router might forward and otherwise fall back to the
 * path the last save dialog returned (every writer in the app follows a `dialog.save`).
 */
function resolveWritePath(args: Record<string, unknown>): string {
	const headers = (args.headers ?? args.__headers ?? (args.options as Record<string, unknown> | undefined)?.headers) as Record<string, unknown> | undefined
	const raw = args.path ?? headers?.path
	if (raw === undefined) {
		const fallback = lastSavePath ?? `${DOCUMENTS_FOLDER}/untitled`
		console.warn('[mock-fs] write without a path (invoke headers were dropped); writing to', fallback)
		return fallback
	}
	return toPosixPath(decodeURIComponent(String(raw)))
}

function resolveWriteData(args: Record<string, unknown>): Uint8Array {
	const candidate = args.data ?? args.__body ?? args.__payload ?? args.payload ?? args
	if (candidate instanceof Uint8Array) {
		return candidate
	}
	if (candidate instanceof ArrayBuffer) {
		return new Uint8Array(candidate)
	}
	if (Array.isArray(candidate)) {
		return new Uint8Array(candidate as number[])
	}
	return new Uint8Array()
}

// --- store ----------------------------------------------------------------
// Protocol (plugin-store dist-js): `load` returns a resource id; every other command
// takes `{ rid, ... }`. `get` resolves to the tuple `[value, exists]`.

const STORE_PREFIX = 'mock-tauri-store:'
const storeRids = new Map<number, string>()
let nextStoreRid = 1

function readStore(path: string): Record<string, unknown> {
	try {
		const raw = localStorage.getItem(STORE_PREFIX + path)
		const parsed: unknown = raw ? JSON.parse(raw) : {}
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}

function writeStore(path: string, data: Record<string, unknown>) {
	try {
		localStorage.setItem(STORE_PREFIX + path, JSON.stringify(data))
	} catch (e) {
		console.warn('[mock-store] failed to persist store', e)
	}
}

function storePath(rid: unknown): string {
	const path = storeRids.get(rid as number)
	if (!path) {
		throw new Error(`[mock-store] unknown store rid ${String(rid)}`)
	}
	return path
}

function emitStoreChange(rid: number, path: string, key: string, value: unknown, exists: boolean) {
	emitMockEvent('store://change', { path, resourceId: rid, key, value, exists })
}

const storeHandlers: CommandHandlerMap = {
	'plugin:store|load': (args) => {
		const path = String(args.path ?? 'store.json')
		const rid = nextStoreRid++
		storeRids.set(rid, path)
		return rid
	},
	'plugin:store|get_store': (args) => {
		const path = String(args.path ?? 'store.json')
		for (const [rid, existing] of storeRids) {
			if (existing === path) {
				return rid
			}
		}
		return null
	},
	'plugin:store|get': (args) => {
		const data = readStore(storePath(args.rid))
		const key = String(args.key)
		return [data[key] ?? null, key in data]
	},
	'plugin:store|set': (args) => {
		const path = storePath(args.rid)
		const data = readStore(path)
		const key = String(args.key)
		data[key] = args.value
		writeStore(path, data)
		emitStoreChange(args.rid as number, path, key, args.value, true)
		return null
	},
	'plugin:store|has': (args) => String(args.key) in readStore(storePath(args.rid)),
	'plugin:store|delete': (args) => {
		const path = storePath(args.rid)
		const data = readStore(path)
		const key = String(args.key)
		const existed = key in data
		delete data[key]
		writeStore(path, data)
		if (existed) {
			emitStoreChange(args.rid as number, path, key, undefined, false)
		}
		return existed
	},
	'plugin:store|clear': (args) => {
		writeStore(storePath(args.rid), {})
		return null
	},
	'plugin:store|reset': (args) => {
		writeStore(storePath(args.rid), {})
		return null
	},
	'plugin:store|keys': (args) => Object.keys(readStore(storePath(args.rid))),
	'plugin:store|values': (args) => Object.values(readStore(storePath(args.rid))),
	'plugin:store|entries': (args) => Object.entries(readStore(storePath(args.rid))),
	'plugin:store|length': (args) => Object.keys(readStore(storePath(args.rid))).length,
	'plugin:store|reload': () => null,
	'plugin:store|save': () => null,
	// Store.close() / any Resource.close() goes through the core resource table.
	'plugin:resources|close': (args) => {
		storeRids.delete(args.rid as number)
		return null
	},
}

// --- fs -------------------------------------------------------------------

const fsHandlers: CommandHandlerMap = {
	'plugin:fs|exists': (args) => pathExists(toPosixPath(args.path)),
	'plugin:fs|read_dir': (args) => {
		const dir = toPosixPath(args.path).replace(/\/$/, '')
		const prefix = `${dir}/`
		const names = new Map<string, boolean>() // name -> isDirectory
		for (const key of virtualFs.keys()) {
			if (!key.startsWith(prefix)) {
				continue
			}
			const rest = key.slice(prefix.length)
			const slash = rest.indexOf('/')
			if (slash === -1) {
				names.set(rest, false)
			} else {
				names.set(rest.slice(0, slash), true)
			}
		}
		return Array.from(names, ([name, isDirectory]) => ({
			name,
			isDirectory,
			isFile: !isDirectory,
			isSymlink: false,
		}))
	},
	'plugin:fs|mkdir': () => null,
	'plugin:fs|copy_file': (args) => {
		const from = toPosixPath(args.fromPath ?? args.from)
		const to = toPosixPath(args.toPath ?? args.to)
		virtualFs.set(to, virtualFs.get(from) ?? null)
		return null
	},
	// Moves a file, or a whole folder subtree (how a transcript project folder gets renamed).
	'plugin:fs|rename': (args) => {
		const from = toPosixPath(args.oldPath ?? args.from)
		const to = toPosixPath(args.newPath ?? args.to)
		if (virtualFs.has(from)) {
			virtualFs.set(to, virtualFs.get(from) ?? null)
			virtualFs.delete(from)
			return null
		}
		const prefix = `${from}/`
		for (const key of Array.from(virtualFs.keys())) {
			if (key.startsWith(prefix)) {
				virtualFs.set(`${to}/${key.slice(prefix.length)}`, virtualFs.get(key) ?? null)
				virtualFs.delete(key)
			}
		}
		return null
	},
	'plugin:fs|remove': (args) => {
		const path = toPosixPath(args.path)
		virtualFs.delete(path)
		const prefix = `${path}/`
		for (const key of Array.from(virtualFs.keys())) {
			if (key.startsWith(prefix)) {
				virtualFs.delete(key)
			}
		}
		return null
	},
	'plugin:fs|write_file': (args) => {
		virtualFs.set(resolveWritePath(args), resolveWriteData(args))
		return null
	},
	'plugin:fs|write_text_file': (args) => {
		virtualFs.set(resolveWritePath(args), new TextDecoder().decode(resolveWriteData(args)))
		return null
	},
	'plugin:fs|read_file': (args) => {
		const contents = virtualFs.get(toPosixPath(args.path))
		if (typeof contents === 'string') {
			return Array.from(new TextEncoder().encode(contents))
		}
		return contents ? Array.from(contents) : []
	},
	'plugin:fs|read_text_file': (args) => {
		// plugin-fs decodes the response via Uint8Array.from(...), so this must be raw bytes.
		const contents = virtualFs.get(toPosixPath(args.path))
		if (typeof contents === 'string') {
			return Array.from(new TextEncoder().encode(contents))
		}
		return contents ? Array.from(contents) : []
	},
}

// --- dialog ---------------------------------------------------------------
// Never open a blocking native/browser dialog in mock mode: log and resolve instead.

interface DialogOpenOptions {
	multiple?: boolean
	directory?: boolean
	filters?: { name: string; extensions: string[] }[]
	defaultPath?: string
}

const dialogHandlers: CommandHandlerMap = {
	'plugin:dialog|open': (args) => {
		const options = (args.options ?? {}) as DialogOpenOptions
		if (options.directory) {
			return options.multiple ? [DOCUMENTS_FOLDER] : DOCUMENTS_FOLDER
		}
		// multiple:true simulates a multi-select so the batch queue UI is reachable in browser
		// mode; the floating mock toolbar (runtime.ts) can force single-file picks instead.
		if (options.multiple && localStorage.getItem('mock-dialog-multi') !== 'off') {
			return [...virtualFs.keys()].filter((key) => key.startsWith(`${DOCUMENTS_FOLDER}/`) && /\.(mp3|mp4|wav)$/.test(key))
		}
		const single = `${DOCUMENTS_FOLDER}/sample.mp3`
		return options.multiple ? [single] : single
	},
	'plugin:dialog|save': (args) => {
		const options = (args.options ?? {}) as DialogOpenOptions
		const ext = options.filters?.[0]?.extensions?.[0] ?? 'txt'
		lastSavePath = options.defaultPath ? toPosixPath(options.defaultPath) : `${DOCUMENTS_FOLDER}/transcript.${ext}`
		return lastSavePath
	},
	'plugin:dialog|message': (args) => {
		console.info('[mock-dialog] message', args.title, args.message)
		return null
	},
	'plugin:dialog|ask': (args) => {
		console.info('[mock-dialog] ask (auto-yes)', args.title, args.message)
		return true
	},
	'plugin:dialog|confirm': (args) => {
		console.info('[mock-dialog] confirm (auto-ok)', args.title, args.message)
		return true
	},
}

// --- clipboard-manager ----------------------------------------------------

const clipboardHandlers: CommandHandlerMap = {
	'plugin:clipboard-manager|write_text': async (args) => {
		const text = String(args.text ?? '')
		console.info('[mock-clipboard] writeText', text)
		try {
			await navigator.clipboard?.writeText(text)
		} catch (e) {
			console.info('[mock-clipboard] navigator.clipboard unavailable', e)
		}
		return null
	},
	'plugin:clipboard-manager|read_text': () => '',
	'plugin:clipboard-manager|write_html': () => null,
	'plugin:clipboard-manager|clear': () => null,
}

// --- notification ---------------------------------------------------------

const notificationHandlers: CommandHandlerMap = {
	'plugin:notification|is_permission_granted': () => true,
	'plugin:notification|request_permission': () => 'granted',
	'plugin:notification|notify': (args) => {
		console.info('[mock-notification] notify', args)
		return null
	},
	'plugin:notification|get_pending': () => [],
	'plugin:notification|get_active': () => [],
	'plugin:notification|cancel': () => null,
	'plugin:notification|remove_active': () => null,
	'plugin:notification|register_action_types': () => null,
}

// --- updater --------------------------------------------------------------
// `check` resolves to null when there is nothing to update.

const updaterHandlers: CommandHandlerMap = {
	'plugin:updater|check': () => null,
	'plugin:updater|download': () => {
		console.warn('[mock-updater] download is a no-op')
		return 0
	},
	'plugin:updater|install': () => {
		console.warn('[mock-updater] install is a no-op')
		return null
	},
	'plugin:updater|download_and_install': () => {
		console.warn('[mock-updater] downloadAndInstall is a no-op')
		return null
	},
}

// --- global-shortcut ------------------------------------------------------
// Shortcuts are tracked but never fire: the Channel handler is dropped on purpose.

const registeredShortcuts = new Set<string>()

const globalShortcutHandlers: CommandHandlerMap = {
	'plugin:global-shortcut|register': (args) => {
		for (const shortcut of (args.shortcuts ?? []) as string[]) {
			registeredShortcuts.add(shortcut)
		}
		return null
	},
	'plugin:global-shortcut|unregister': (args) => {
		for (const shortcut of (args.shortcuts ?? []) as string[]) {
			registeredShortcuts.delete(shortcut)
		}
		return null
	},
	'plugin:global-shortcut|unregister_all': () => {
		registeredShortcuts.clear()
		return null
	},
	'plugin:global-shortcut|is_registered': (args) => registeredShortcuts.has(String(args.shortcut)),
}

// --- process / opener / deep-link / os / app ------------------------------

const miscPluginHandlers: CommandHandlerMap = {
	'plugin:process|exit': (args) => {
		console.warn('[mock-process] exit ignored', args.code)
		return null
	},
	'plugin:process|restart': () => {
		console.warn('[mock-process] restart ignored')
		return null
	},

	'plugin:opener|open_url': (args) => {
		const url = String(args.url ?? '')
		if (/^https?:\/\//i.test(url)) {
			window.open(url, '_blank')
		} else {
			console.info('[mock-opener] open_url', url)
		}
		return null
	},
	'plugin:opener|open_path': (args) => {
		console.info('[mock-opener] open_path', args.path)
		return null
	},
	'plugin:opener|reveal_item_in_dir': (args) => {
		console.info('[mock-opener] reveal_item_in_dir', args.paths)
		return null
	},

	// onOpenUrl() only listens on `deep-link://new-url`, which the mock never emits.
	'plugin:deep-link|get_current': () => null,
	'plugin:deep-link|register': () => null,
	'plugin:deep-link|unregister': () => null,
	'plugin:deep-link|is_registered': () => false,

	// The sync os APIs read __TAURI_OS_PLUGIN_INTERNALS__ (stubbed elsewhere); these are the async ones.
	'plugin:os|locale': () => 'en-US',
	'plugin:os|version': () => '15.0.0',
	'plugin:os|platform': () => mockPlatform,
	'plugin:os|hostname': () => 'mock-host',

	'plugin:app|version': () => appVersion,
	'plugin:app|name': () => appName,
	'plugin:app|tauri_version': () => '2.10.1',
	'plugin:app|identifier': () => 'github.thewh1teagle.vibe',
	'plugin:app|app_show': () => null,
	'plugin:app|app_hide': () => null,
	'plugin:app|set_app_theme': () => null,
	'plugin:app|set_dock_visibility': () => null,
	'plugin:app|default_window_icon': () => null,
}

export const pluginHandlers: CommandHandlerMap = {
	...storeHandlers,
	...fsHandlers,
	...dialogHandlers,
	...clipboardHandlers,
	...notificationHandlers,
	...updaterHandlers,
	...globalShortcutHandlers,
	...miscPluginHandlers,
	...httpHandlers,
}
