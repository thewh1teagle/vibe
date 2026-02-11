import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignRight, Check, Copy, Download, Printer } from 'lucide-react'
import { Segment, asCsv, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, cn, openPath } from '~/lib/utils'
import { TextFormat, formatExtensions } from './FormatSelect'
import { usePreferenceProvider } from '~/providers/Preference'
import HTMLView from './HtmlView'
import { toast } from 'sonner'
import { invoke } from '@tauri-apps/api/core'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { toDocx } from '~/lib/docx'
import { path } from '@tauri-apps/api'
import Markdown from 'react-markdown'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

function CopyButton({ text }: { text: string }) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	const [info, setInfo] = useState(t('common.copy'))
	const resetTimerRef = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (resetTimerRef.current) {
				window.clearTimeout(resetTimerRef.current)
			}
		}
	}, [])

	function onCopy() {
		clipboard.writeText(text)
		setCopied(true)
		setInfo(t('common.copied'))
		if (resetTimerRef.current) {
			window.clearTimeout(resetTimerRef.current)
		}
		resetTimerRef.current = window.setTimeout(() => {
			setCopied(false)
			setInfo(t('common.copy'))
			resetTimerRef.current = null
		}, 1000)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="icon" onMouseDown={onCopy}>
					{copied ? <Check className="h-5 w-5" strokeWidth={2.3} /> : <Copy className="h-5 w-5" strokeWidth={2.1} />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{info}</TooltipContent>
		</Tooltip>
	)
}

export default function TextArea({
	segments,
	readonly,
	placeholder,
	file,
	textFormat,
	setTextFormat,
}: {
	segments: Segment[] | null
	readonly: boolean
	placeholder?: string
	file: NamedPath
	textFormat: TextFormat
	setTextFormat: Dispatch<SetStateAction<TextFormat>>
}) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()
	const [text, setText] = useState('')

	const speakerLabel = t('common.speaker-prefix')
	useEffect(() => {
		if (segments) {
			setText(
				textFormat === 'vtt'
					? asVtt(segments, speakerLabel)
					: textFormat === 'srt'
						? asSrt(segments, speakerLabel)
						: textFormat === 'json'
							? asJson(segments)
							: textFormat === 'csv'
								? asCsv(segments)
							: asText(segments, speakerLabel),
			)
		} else {
			setText('')
		}
	}, [textFormat, segments, speakerLabel])

	async function download(textToSave: string, format: TextFormat, srcFile: NamedPath) {
		if (format === 'html') {
			textToSave = document.querySelector('.html')!.outerHTML.replace('contenteditable="true"', 'contenteditable="false"')
		}
		if (format === 'pdf') {
			window.print()
			return
		}

		const ext = formatExtensions[format].slice(1)
		const defaultPath = await invoke<NamedPath>('get_save_path', { srcPath: srcFile.path, targetExt: ext })
		const filePath = await dialog.save({
			filters: [{ name: '', extensions: [ext] }],
			canCreateDirectories: true,
			defaultPath: defaultPath.path,
		})

		if (!filePath) return

		if (format === 'docx') {
			const fileName = await path.basename(filePath)
			const doc = await toDocx(fileName, segments!, preference.textAreaDirection, speakerLabel)
			const arrayBuffer = await doc.arrayBuffer()
			await fs.writeFile(filePath, new Uint8Array(arrayBuffer))
		} else {
			await fs.writeTextFile(filePath, textToSave)
		}

		toast.success(t('common.save-success'), {
			description: defaultPath?.name,
			position: 'bottom-center',
			action: { label: t('common.find-here'), onClick: () => openPath({ name: '', path: filePath }) },
		})
	}

	return (
		<div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
			<div className="flex w-full shrink-0 flex-wrap items-center gap-1 rounded-tl-lg rounded-tr-lg bg-muted p-1">
				<CopyButton text={text} />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" onMouseDown={() => download(text, textFormat, file)}>
							<Download className="h-5 w-5" strokeWidth={2.1} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('common.save-transcript')}</TooltipContent>
				</Tooltip>

				{['html', 'pdf'].includes(textFormat) && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onMouseDown={() => window.print()}>
								<Printer className="h-5 w-5" strokeWidth={2.1} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t('common.print-tooltip')}</TooltipContent>
					</Tooltip>
				)}

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								preference.textAreaDirection === 'rtl' ? 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary' : '',
							)}
							onMouseDown={() => preference.setTextAreaDirection(preference.textAreaDirection === 'rtl' ? 'ltr' : 'rtl')}>
							<AlignRight className="h-5 w-5" strokeWidth={2.1} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('common.right-alignment')}</TooltipContent>
				</Tooltip>

				<div className="ms-auto me-1 min-w-[98px]">
					<Select value={textFormat} onValueChange={(value) => setTextFormat(value as TextFormat)}>
						<SelectTrigger className="h-9 w-[98px] px-2 text-sm">
							<SelectValue placeholder={t('common.mode-text')} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="normal">{t('common.mode-text')}</SelectItem>
							<SelectItem value="html">html</SelectItem>
							<SelectItem value="pdf">pdf</SelectItem>
							<SelectItem value="docx">docx</SelectItem>
							<SelectItem value="srt">srt</SelectItem>
							<SelectItem value="vtt">vtt</SelectItem>
							<SelectItem value="json">json</SelectItem>
							<SelectItem value="csv">csv</SelectItem>
							<SelectItem value="md">md</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{['html', 'pdf', 'docx'].includes(textFormat) ? (
				<div className="transcript-editor min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card">
					<HTMLView preference={preference} segments={segments ?? []} file={file} />
				</div>
			) : textFormat === 'md' ? (
				<div
					dir={preference.textAreaDirection}
					className="transcript-editor prose prose-sm dark:prose-invert min-h-0 max-w-none flex-1 overflow-x-hidden overflow-y-auto rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card px-4 py-3">
					<Markdown>{text}</Markdown>
				</div>
			) : (
				<textarea
					placeholder={placeholder}
					readOnly={readonly}
					autoCorrect="off"
					spellCheck={false}
					onChange={(e) => setText(e.target.value)}
					value={text}
					dir={preference.textAreaDirection}
					className={cn(
						'transcript-editor min-h-0 flex-1 resize-none overflow-x-hidden overflow-y-scroll rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card px-3 py-2 text-lg leading-relaxed focus:outline-none',
					)}
				/>
			)}
		</div>
	)
}
