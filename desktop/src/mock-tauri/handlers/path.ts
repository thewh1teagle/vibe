import type { CommandHandlerMap } from '../types'
import { APP_LOCAL_DATA, DOCUMENTS_FOLDER } from '../state'

// @tauri-apps/api/path commands. Virtual paths are POSIX-style, so plain string math suffices.

function normalize(path: string): string {
	const parts = path.split('/').filter((p) => p !== '' && p !== '.')
	const out: string[] = []
	for (const part of parts) {
		if (part === '..') out.pop()
		else out.push(part)
	}
	return (path.startsWith('/') ? '/' : '') + out.join('/')
}

// BaseDirectory enum values from @tauri-apps/api/path (only the ones the app can hit).
const baseDirectories: Record<number, string> = {
	6: DOCUMENTS_FOLDER, // Document
	12: `${APP_LOCAL_DATA}/tmp`, // Temp
	13: `${APP_LOCAL_DATA}/config`, // AppConfig
	14: `${APP_LOCAL_DATA}/data`, // AppData
	15: APP_LOCAL_DATA, // AppLocalData
	16: `${APP_LOCAL_DATA}/cache`, // AppCache
	17: `${APP_LOCAL_DATA}/logs`, // AppLog
}

export const pathHandlers: CommandHandlerMap = {
	'plugin:path|join': (args) => normalize((args.paths as string[]).join('/')),
	'plugin:path|normalize': (args) => normalize(args.path as string),
	'plugin:path|resolve': (args) => normalize((args.paths as string[]).join('/')),
	'plugin:path|dirname': (args) => {
		const path = (args.path as string).replace(/\/+$/, '')
		return path.slice(0, path.lastIndexOf('/')) || '/'
	},
	'plugin:path|basename': (args) => {
		const path = (args.path as string).replace(/\/+$/, '')
		let base = path.slice(path.lastIndexOf('/') + 1)
		const ext = args.ext as string | undefined
		if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length)
		return base
	},
	'plugin:path|extname': (args) => {
		const base = (args.path as string).split('/').pop() ?? ''
		const dot = base.lastIndexOf('.')
		if (dot <= 0) throw `path "${args.path}" has no extension`
		return base.slice(dot + 1)
	},
	'plugin:path|is_absolute': (args) => (args.path as string).startsWith('/'),
	'plugin:path|resolve_directory': (args) => baseDirectories[args.directory as number] ?? `${APP_LOCAL_DATA}/misc`,
}
