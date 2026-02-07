import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as AlignRightIcon } from '~/icons/align-right.svg'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as DownloadIcon } from '~/icons/download.svg'
import { ReactComponent as PrintIcon } from '~/icons/print.svg'
import { Segment, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { ModifyState, NamedPath, cn, openPath } from '~/lib/utils'
import { TextFormat, formatExtensions } from './FormatSelect'
import { usePreferenceProvider } from '~/providers/Preference'
import HTMLView from './HtmlView'
import { toast } from 'sonner'
import { invoke } from '@tauri-apps/api/core'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { toDocx } from '~/lib/docx'
import { path } from '@tauri-apps/api'
import { Button } from '~/components/ui/button'
import { Textarea as UITextarea } from '~/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { NativeSelect } from '~/components/ui/native-select'

function Copy({ text }: { text: string }) {
	const { t } = useTranslation()
	const [info, setInfo] = useState(t('common.copy'))

	function onCopy() {
		clipboard.writeText(text)
		setInfo(t('common.copied'))
		setTimeout(() => setInfo(t('common.copy')), 1000)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="icon" onMouseDown={onCopy}>
					<CopyIcon className="h-6 w-6" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{info}</TooltipContent>
		</Tooltip>
	)
}

function ReplaceWithBox({
	segments,
	setSegments,
	x,
	y,
	dir,
	onClickOutside,
	selected,
}: {
	selected: string
	segments: Segment[] | null
	setSegments: ModifyState<Segment[] | null>
	x: number
	y: number
	dir: 'ltr' | 'rtl'
	onClickOutside: () => void
}) {
	const boxRef = useRef<HTMLDivElement>(null)
	const { t } = useTranslation()
	const [value, setValue] = useState('')

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
				onClickOutside()
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [onClickOutside])

	function replace() {
		setSegments(segments!.map((s) => ({ ...s, text: s.text.replace(selected, value) })))
		onClickOutside()
	}

	return (
		<div ref={boxRef} style={{ left: Math.max(x, 50), top: y }} className="absolute z-10 w-64 rounded-md border bg-popover p-2 shadow-md">
			<UITextarea value={value} onChange={(e) => setValue(e.target.value)} dir={dir} className="resize-none" placeholder={`${t('common.replace-all')}... (${selected})`} />
			<Button onClick={replace} size="sm" className="mt-2 w-full">
				{t('common.replace-all')}
			</Button>
		</div>
	)
}

export default function TextArea({
	segments,
	setSegments,
	readonly,
	placeholder,
	file,
}: {
	segments: Segment[] | null
	setSegments: ModifyState<Segment[] | null>
	readonly: boolean
	placeholder?: string
	file: NamedPath
}) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()
	const [text, setText] = useState('')
	const [replaceBoxVisible, setReplaceBoxVisible] = useState(false)
	const replaceBoxVisibleRef = useRef(false)
	const [replaceBoxPos, setReplaceBoxPos] = useState({ x: 0, y: 0 })
	const [selectedText, setSelectedText] = useState('')
	const segmentsTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
	const segmentsInFocusRef = useRef<boolean>(false)

	useEffect(() => {
		if (segments) {
			setText(
				preference.textFormat === 'vtt'
					? asVtt(segments)
					: preference.textFormat === 'srt'
					? asSrt(segments)
					: preference.textFormat === 'json'
					? asJson(segments)
					: asText(segments)
			)
		} else {
			setText('')
		}
	}, [preference.textFormat, segments])

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
			const doc = await toDocx(fileName, segments!, preference.textAreaDirection)
			const arrayBuffer = await doc.arrayBuffer()
			await fs.writeFile(filePath, new Uint8Array(arrayBuffer))
		} else {
			await fs.writeTextFile(filePath, textToSave)
		}

		toast.success(t('common.save-success'), {
			description: defaultPath?.name,
			position: 'bottom-center',
			action: { label: t('common.open'), onClick: () => openPath({ name: '', path: filePath }) },
		})
	}

	useEffect(() => {
		replaceBoxVisibleRef.current = replaceBoxVisible
	}, [replaceBoxVisible])

	function onMouseUp(event: MouseEvent) {
		if (!segmentsInFocusRef.current || replaceBoxVisibleRef.current) return
		const selection = window.getSelection()?.toString()
		if (!selection) return

		setSelectedText(selection)
		setReplaceBoxPos({ x: event.pageX - 10, y: event.pageY - 40 })
		if (selection.length < 100) setReplaceBoxVisible(true)
	}

	useEffect(() => {
		window.addEventListener('mouseup', onMouseUp)
		return () => window.removeEventListener('mouseup', onMouseUp)
	}, [])

	return (
		<div className="w-full h-full">
			{replaceBoxVisible && (
				<ReplaceWithBox
					selected={selectedText}
					segments={segments}
					setSegments={setSegments}
					onClickOutside={() => {
						setSelectedText('')
						setReplaceBoxVisible(false)
					}}
					x={replaceBoxPos.x}
					y={replaceBoxPos.y}
					dir={preference.textAreaDirection}
				/>
			)}

			<div className="w-full bg-muted rounded-tl-lg rounded-tr-lg flex flex-row items-center gap-1 px-1">
				<Copy text={text} />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" onMouseDown={() => download(text, preference.textFormat, file)}>
							<DownloadIcon className="h-6 w-6" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('common.save-transcript')}</TooltipContent>
				</Tooltip>

				{['html', 'pdf'].includes(preference.textFormat) && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onMouseDown={() => window.print()}>
								<PrintIcon className="w-6 h-6" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t('common.print-tooltip')}</TooltipContent>
					</Tooltip>
				)}

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={preference.textAreaDirection === 'rtl' ? 'secondary' : 'ghost'}
							size="icon"
							onMouseDown={() => preference.setTextAreaDirection(preference.textAreaDirection === 'rtl' ? 'ltr' : 'rtl')}>
							<AlignRightIcon className="w-6 h-6" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t('common.right-alignment')}</TooltipContent>
				</Tooltip>

				<div className="ms-auto me-1">
					<NativeSelect
						value={preference.textFormat}
						onChange={(event) => preference.setTextFormat(event.target.value as TextFormat)}>
						<option value="normal">{t('common.mode-text')}</option>
						<option value="html">html</option>
						<option value="pdf">pdf</option>
						<option value="docx">docx</option>
						<option value="srt">srt</option>
						<option value="vtt">vtt</option>
						<option value="json">json</option>
					</NativeSelect>
				</div>
			</div>

			{['html', 'pdf', 'docx'].includes(preference.textFormat) ? (
				<HTMLView preference={preference} segments={segments ?? []} file={file} />
			) : (
				<UITextarea
					onFocus={() => (segmentsInFocusRef.current = true)}
					onBlur={() => (segmentsInFocusRef.current = false)}
					ref={segmentsTextAreaRef}
					placeholder={placeholder}
					readOnly={readonly}
					autoCorrect="off"
					spellCheck={false}
					onChange={(e) => setText(e.target.value)}
					value={text}
					dir={preference.textAreaDirection}
					className={cn('w-full h-full text-lg rounded-tl-none rounded-tr-none focus:outline-none')}
				/>
			)}
		</div>
	)
}
