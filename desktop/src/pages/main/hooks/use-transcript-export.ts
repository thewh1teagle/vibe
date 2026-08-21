import { path as pathApi } from '@tauri-apps/api'
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
import { asCsv, asJson, asSrt, asText, asVtt, type Segment } from '~/lib/transcript'
import type { NamedPath } from '~/lib/types'
import { usePreferenceProvider } from '~/providers/preference'

/** Formats offered by the Export dropdown, in menu order. */
export const exportFormats: TextFormat[] = ['normal', 'srt', 'vtt', 'html', 'pdf', 'json', 'docx']

export const exportFormatLabels: Record<TextFormat, string> = {
	normal: 'txt',
	srt: 'srt',
	vtt: 'vtt',
	html: 'html',
	pdf: 'pdf',
	json: 'json',
	docx: 'docx',
	csv: 'csv',
	md: 'md',
}

export function useTranscriptExport(segments: Segment[], file: NamedPath | null) {
	const preference = usePreferenceProvider()
	const speakerLabel = m.speakerPrefix()

	const plainText = useMemo(() => asText(segments, speakerLabel), [segments, speakerLabel])

	const asFormat = useCallback(
		(format: TextFormat) => {
			switch (format) {
				case 'srt':
					return asSrt(segments, speakerLabel)
				case 'vtt':
					return asVtt(segments, speakerLabel)
				case 'json':
					return asJson(segments)
				case 'csv':
					return asCsv(segments)
				case 'html':
					// The reading view keeps an offscreen HTMLView mounted for exactly this.
					return document.querySelector('.html')?.outerHTML.replace('contenteditable="true"', 'contenteditable="false"') ?? plainText
				default:
					return plainText
			}
		},
		[plainText, segments, speakerLabel],
	)

	const copy = useCallback(async () => {
		await clipboard.writeText(plainText)
	}, [plainText])

	const exportAs = useCallback(
		async (format: TextFormat) => {
			if (!file || segments.length === 0) return
			if (format === 'pdf') {
				window.print()
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
				const title = await pathApi.basename(target)
				const document = await toDocx(title, segments, preference.textAreaDirection, speakerLabel)
				await fs.writeFile(target, new Uint8Array(await document.arrayBuffer()))
			} else {
				await fs.writeTextFile(target, asFormat(format))
			}

			toast.success(m.saveSuccess(), {
				description: suggested.name,
				position: 'bottom-center',
				action: { label: m.findHere(), onClick: () => openPath({ name: '', path: target }) },
			})
		},
		[asFormat, file, preference.textAreaDirection, segments, speakerLabel],
	)

	return { plainText, copy, exportAs }
}
