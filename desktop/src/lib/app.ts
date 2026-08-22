import { invoke } from '@tauri-apps/api/core'
import * as fsExt from '@tauri-apps/plugin-fs'
import { load } from '@tauri-apps/plugin-store'
import * as config from './config'
import { NamedPath } from './types'

export function openSettingsSection(scrollTo: string) {
	window.dispatchEvent(new CustomEvent('vibe:open-settings', { detail: { scrollTo } }))
}

export async function resetApp() {
	const modelPath = localStorage.getItem('model_path')
	try {
		const store = await load(config.storeFilename)
		await store.clear()
		if (modelPath) {
			try {
				await fsExt.remove(modelPath)
			} catch (e) {
				console.error(e)
			}
		}
	} catch (e) {
		console.error(e)
	} finally {
		localStorage.clear()
		location.href = '/setup'
	}
}

/** Longest title GitHub shows without truncating it in issue lists. */
const ISSUE_TITLE_MAX = 90

/** Log lines carry a timestamp, a level and sometimes a JSON wrapper before the part worth reading. */
function readableLine(line: string): string {
	const trimmed = line.trim()
	if (!trimmed) return ''

	// tracing writes one JSON object per line; the message is the only part a human needs.
	if (trimmed.startsWith('{')) {
		try {
			const parsed: unknown = JSON.parse(trimmed)
			const message = (parsed as { fields?: { message?: unknown } })?.fields?.message
			return typeof message === 'string' ? message.trim() : ''
		} catch {
			return ''
		}
	}

	return trimmed
		.replace(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?\s*/, '')
		.replace(/^\[?(TRACE|DEBUG|INFO|WARN|ERROR)]?:?\s*/i, '')
		.replace(/^(error|panicked at)\s*:?\s*/i, '')
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * A title that says what actually broke, taken from the first usable line of the log.
 *
 * Every report used to arrive as "App reports bug", which made the tracker impossible to search or
 * deduplicate: the symptom only appeared once someone opened the issue and read the log.
 */
export function issueTitleFrom(log: string): string {
	const line = log
		.split('\n')
		.map(readableLine)
		.find((candidate) => candidate.length > 3 && !/^(no message found|invalid json)$/i.test(candidate))

	if (!line) return 'App reports bug'
	return line.length > ISSUE_TITLE_MAX ? `${line.slice(0, ISSUE_TITLE_MAX - 1).trimEnd()}…` : line
}

/**
 * Prefills the bug template with what the app already knows: the failure as the title and as the
 * "what happened" answer, and the collected diagnostics as the log block.
 */
export async function getIssueUrl(logs: string) {
	const params = new URLSearchParams({
		labels: 'bug',
		template: 'bug_report.yaml',
		title: issueTitleFrom(logs),
		'what-happened': issueTitleFrom(logs),
		logs,
	})
	return `https://github.com/thewh1teagle/vibe/issues/new?${params.toString()}`
}

export async function openPath(path: NamedPath) {
	await invoke('open_path', { path: path.path })
}
