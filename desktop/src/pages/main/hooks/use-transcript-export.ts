import { invoke } from '@tauri-apps/api/core'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { formatExtensions, type TextFormat } from '~/components/format-select'
import { openPath } from '~/lib/app'
import { toDocx } from '~/lib/docx'
import { serializeTranscriptExport, type TranscriptExportContent, type TranscriptExportOptions } from '~/lib/transcript-export'
import type { Segment } from '~/lib/transcript'
import type { NamedPath } from '~/lib/types'
import { usePreferenceProvider } from '~/providers/preference'

interface UseTranscriptExportOptions {
	enabled?: boolean
	segments: Segment[]
	summary?: string
	file: NamedPath | null
	format: TextFormat
	content: TranscriptExportContent
	showTimestamps: boolean
	showSpeakers: boolean
}

export function useTranscriptExport({ enabled = true, segments, summary, file, format, content, showTimestamps, showSpeakers }: UseTranscriptExportOptions) {
	const preference = usePreferenceProvider()
	const speakerLabel = m.speakerPrefix()
	const serializerOptions = useMemo<TranscriptExportOptions>(
		() => ({
			content,
			showTimestamps,
			showSpeakers,
			speakerLabel,
			title: file?.name ?? '',
			direction: preference.textAreaDirection,
			theme: preference.theme,
		}),
		[content, file?.name, preference.textAreaDirection, preference.theme, showSpeakers, showTimestamps, speakerLabel],
	)
	const preview = useMemo(
		() => (enabled ? serializeTranscriptExport(format, segments, summary, serializerOptions) : ''),
		[enabled, format, segments, serializerOptions, summary],
	)
	const renderedPreview = useMemo(
		() =>
			enabled && (format === 'html' || format === 'docx' || format === 'pdf')
				? serializeTranscriptExport('html', segments, summary, serializerOptions)
				: undefined,
		[enabled, format, segments, serializerOptions, summary],
	)

	const copy = useCallback(async () => {
		await clipboard.writeText(preview)
		toast.success(m.exportCopied(), { position: 'bottom-center' })
	}, [preview])

	const save = useCallback(async () => {
		if (!file || (segments.length === 0 && !summary)) return
		if (format === 'pdf') {
			// The complete print tree exists only while the system print sheet is open.
			const html = serializeTranscriptExport('html', segments, summary, serializerOptions)
			const parsed = new DOMParser().parseFromString(html, 'text/html')
			const printable = parsed.body.firstElementChild
			if (!printable) return
			const mounted = document.importNode(printable, true)
			const styles = [...parsed.head.querySelectorAll('style')].map((style) => document.importNode(style, true))
			for (const style of styles) document.head.appendChild(style)
			document.body.appendChild(mounted)
			try {
				window.print()
			} finally {
				mounted.remove()
				for (const style of styles) style.remove()
			}
			return
		}

		const extension = formatExtensions[format].slice(1)
		const suggested = await invoke<NamedPath>('get_save_path', { srcPath: file.path, targetExt: extension })
		const target = await dialog.save({
			filters: [{ name: '', extensions: [extension] }],
			canCreateDirectories: true,
			defaultPath: suggested.path,
		})
		if (!target) return

		if (format === 'docx') {
			const document = await toDocx(file.name, segments, preference.textAreaDirection, speakerLabel, {
				content,
				showTimestamps,
				showSpeakers,
				summary,
				transcriptLabel: m.exportTranscript(),
				summaryLabel: m.exportSummary(),
				theme: preference.theme,
			})
			await fs.writeFile(target, new Uint8Array(await document.arrayBuffer()))
		} else {
			// This is the exact string shown in the live preview.
			await fs.writeTextFile(target, preview)
		}

		toast.success(m.saveSuccess(), {
			description: suggested.name,
			position: 'bottom-center',
			action: { label: m.findHere(), onClick: () => openPath({ name: '', path: target }) },
		})
	}, [
		content,
		file,
		format,
		preference.textAreaDirection,
		preference.theme,
		preview,
		segments,
		serializerOptions,
		showSpeakers,
		showTimestamps,
		speakerLabel,
		summary,
	])

	return { preview, renderedPreview, copy, save }
}
