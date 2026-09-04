import { invoke } from '@tauri-apps/api/core'
import * as pathApi from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import { formatExtensions, type TextFormat } from '~/components/format-select'
import { toDocx } from '~/lib/docx'
import { transcriptToPdf } from '~/lib/pdf/transcript-pdf'
import { projectExportFilename } from '~/lib/project-name'
import type { Segment, SpeakerNames } from '~/lib/transcript'
import { serializeTranscriptExport, type TranscriptExportOptions } from '~/lib/transcript-export'
import { transcriptsFolder } from '~/lib/transcripts-store'

/**
 * Auto-export: every transcript that finishes is written out in the chosen formats, to
 * the chosen place, without anyone opening it. This is what batch users want from a
 * folder of recordings: the files, and a clear word on where they went.
 */

export type AutoExportDestination = 'beside' | 'projects' | 'folder'

export interface AutoExportSettings {
	enabled: boolean
	formats: TextFormat[]
	/** `beside` the recording, the app's `projects` folder, or one `folder` the user chose. */
	destination: AutoExportDestination
	/** The chosen folder, when `destination` is `folder`. */
	folder: string | null
	/** Overwrite a file that is already there. Off: leave it and report the job as skipped. */
	replace: boolean
}

export const DEFAULT_AUTO_EXPORT: AutoExportSettings = {
	enabled: false,
	formats: ['vtt'],
	destination: 'beside',
	folder: null,
	replace: false,
}

export type AutoExportStatus = 'exported' | 'skipped' | 'fallback' | 'failed'

export interface AutoExportResult {
	status: AutoExportStatus
	/** Files written, in this order of `formats`. */
	paths: string[]
	formats: TextFormat[]
	/** The folder the files went to, for "Open folder". */
	folder: string
	/** What was skipped or why the destination changed, for the row and the details list. */
	detail?: string
}

/** What a job hands over to be exported: no React, no queue types. */
export interface ExportInput {
	name: string
	path: string
	segments: Segment[]
	summary?: string
	speakerNames?: SpeakerNames
}

export interface ExportRendering {
	direction: 'rtl' | 'ltr'
	theme: 'light' | 'dark'
	showTimestamps: boolean
	showSpeakers: boolean
	speakerLabel: string
	labels: { transcript: string; summary: string }
}

/** The file system as the exporter sees it; swapped for a fake in tests. */
export interface ExportIo {
	besidePath: (source: string, suffix: string) => Promise<string>
	projectsFolder: () => Promise<string>
	join: (...parts: string[]) => Promise<string>
	dirname: (path: string) => Promise<string>
	exists: (path: string) => Promise<boolean>
	mkdir: (path: string) => Promise<void>
	writeText: (path: string, text: string) => Promise<void>
	writeBytes: (path: string, bytes: Uint8Array) => Promise<void>
}

export function tauriExportIo(projectsPath: string | null): ExportIo {
	return {
		besidePath: (source, suffix) => invoke<string>('get_path_dst', { src: source, suffix }),
		projectsFolder: () => transcriptsFolder(projectsPath),
		join: (...parts) => pathApi.join(...parts),
		dirname: (path) => pathApi.dirname(path),
		exists: (path) => fs.exists(path),
		mkdir: (path) => fs.mkdir(path, { recursive: true }),
		writeText: (path, text) => fs.writeTextFile(path, text),
		writeBytes: (path, bytes) => fs.writeFile(path, bytes),
	}
}

/** The bytes or text one format produces; the same renderers the export dialog uses. */
export async function renderExport(format: TextFormat, input: ExportInput, rendering: ExportRendering): Promise<string | Uint8Array> {
	const options: TranscriptExportOptions = {
		content: input.summary ? 'both' : 'transcript',
		showTimestamps: rendering.showTimestamps,
		showSpeakers: rendering.showSpeakers,
		speakerLabel: rendering.speakerLabel,
		speakerNames: input.speakerNames,
		title: input.name,
		direction: rendering.direction,
		theme: rendering.theme,
	}
	if (format === 'pdf') {
		return transcriptToPdf(input.segments, input.summary ?? '', options, rendering.labels)
	}
	if (format === 'docx') {
		const document = await toDocx(input.name, input.segments, rendering.direction, rendering.speakerLabel, {
			content: options.content,
			showTimestamps: rendering.showTimestamps,
			showSpeakers: rendering.showSpeakers,
			speakerNames: input.speakerNames,
			summary: input.summary,
			transcriptLabel: rendering.labels.transcript,
			summaryLabel: rendering.labels.summary,
		})
		return new Uint8Array(await document.arrayBuffer())
	}
	return serializeTranscriptExport(format, input.segments, input.summary, options)
}

/** Where one format's file goes for this destination. */
async function targetPath(input: ExportInput, format: TextFormat, destination: AutoExportDestination, folder: string | null, io: ExportIo) {
	const suffix = formatExtensions[format]
	if (destination === 'beside') return io.besidePath(input.path, suffix)
	const base = destination === 'folder' && folder ? folder : await io.projectsFolder()
	return io.join(base, projectExportFilename(input.name, suffix.slice(1)))
}

function isPermissionError(error: unknown) {
	const text = String(error).toLowerCase()
	return /permission|denied|read-only|readonly|eacces|eperm|erofs|access is denied/.test(text)
}

/**
 * Write every chosen format for one finished transcript. Never throws: the result says
 * what happened, and a transcription is never marked failed because a file could not
 * be written.
 *
 * A destination beside the recording that turns out read-only (a DVD, a network share, a
 * cloud placeholder) falls back to the projects folder and says so.
 */
export async function exportTranscript(
	input: ExportInput,
	settings: AutoExportSettings,
	rendering: ExportRendering,
	io: ExportIo,
	messages: { skipped: (names: string) => string; fallback: string },
): Promise<AutoExportResult> {
	const formats = settings.formats.length > 0 ? settings.formats : DEFAULT_AUTO_EXPORT.formats
	const attempt = async (destination: AutoExportDestination): Promise<AutoExportResult> => {
		const written: string[] = []
		const writtenFormats: TextFormat[] = []
		const kept: string[] = []
		let folder = ''
		for (const format of formats) {
			const target = await targetPath(input, format, destination, settings.folder, io)
			folder = await io.dirname(target)
			if (!settings.replace && (await io.exists(target))) {
				kept.push(target.split(/[\\/]/).pop() ?? target)
				continue
			}
			await io.mkdir(folder)
			const rendered = await renderExport(format, input, rendering)
			if (typeof rendered === 'string') await io.writeText(target, rendered)
			else await io.writeBytes(target, rendered)
			written.push(target)
			writtenFormats.push(format)
		}
		if (written.length === 0 && kept.length > 0) {
			return { status: 'skipped', paths: [], formats: [], folder, detail: messages.skipped(kept.join(', ')) }
		}
		return { status: 'exported', paths: written, formats: writtenFormats, folder, detail: kept.length ? messages.skipped(kept.join(', ')) : undefined }
	}

	try {
		return await attempt(settings.destination)
	} catch (error) {
		if (settings.destination === 'beside' && isPermissionError(error)) {
			try {
				const result = await attempt('projects')
				return { ...result, status: result.status === 'exported' ? 'fallback' : result.status, detail: messages.fallback }
			} catch (inner) {
				return { status: 'failed', paths: [], formats: [], folder: '', detail: String(inner) }
			}
		}
		return { status: 'failed', paths: [], formats: [], folder: '', detail: String(error) }
	}
}

/** One line for the toast and the notification: "12 exported, 2 skipped, 1 in the projects folder". */
export function summarizeResults(results: AutoExportResult[]) {
	const count = (status: AutoExportStatus) => results.filter((result) => result.status === status).length
	return { exported: count('exported'), skipped: count('skipped'), fallback: count('fallback'), failed: count('failed') }
}

/** The one folder every export went to, when they all share it; otherwise null. */
export function sharedFolder(results: AutoExportResult[]) {
	const folders = new Set(results.filter((result) => result.folder).map((result) => result.folder))
	return folders.size === 1 ? [...folders][0] : null
}
