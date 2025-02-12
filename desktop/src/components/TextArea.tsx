import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as AlignRightIcon } from '~/icons/align-right.svg'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as DownloadIcon } from '~/icons/download.svg'
import { ReactComponent as PrintIcon } from '~/icons/print.svg'
import { Segment, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { ModifyState, NamedPath, cx, openPath } from '~/lib/utils'
import { TextFormat, formatExtensions } from './FormatSelect'
import { usePreferenceProvider } from '~/providers/Preference'
import HTMLView from './HtmlView'
import toast from 'react-hot-toast'
import { invoke } from '@tauri-apps/api/core'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { toDocx } from '~/lib/docx'
import { path } from '@tauri-apps/api'

function Copy({ text }: { text: string }) {
	const { t } = useTranslation()
	const [info, setInfo] = useState(t('common.copy'))

	function onCopy() {
		clipboard.writeText(text)
		setInfo(t('common.copied'))
		setTimeout(() => setInfo(t('common.copy')), 1000)
	}
	return (
		<div className="tooltip tooltip-bottom" data-tip={info}>
			<button className="btn btn-square btn-md" onMouseDown={onCopy}>
				<CopyIcon className="h-6 w-6" />
			</button>
		</div>
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
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const { t } = useTranslation()
	const [value, setValue] = useState('')

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
				onClickOutside()
			}
			event.stopPropagation()
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [onClickOutside])

	useEffect(() => {
		// textAreaRef.current?.focus()
	}, [])

	function replace() {
		setSegments(segments!.map((s) => ({ ...s, text: s.text.replace(selected, value) })))
		onClickOutside()
	}

	const safeX = Math.max(x, 50) // Ensure mouseX is at least 200 pixels

	return (
		<div ref={boxRef} style={{ left: x, top: y }} className="absolute z-10 bg-transparent flex flex-col">
			<details className="dropdown">
				<summary className="cursor-pointer p-0.5 bg-primary rounded-full m-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
						className="h-4 w-4 rounded-3xl">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
						/>
					</svg>
				</summary>
				<ul
					style={{ left: safeX > x ? 50 : 0 }}
					className={cx('menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow', safeX > x && 'absolute')}>
					<textarea
						ref={textAreaRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						dir={dir}
						className="textarea textarea-bordered resize-none"
						name=""
						id=""
						placeholder={`${t('common.replace-all')}... (${selected})`}
					/>
					<button onClick={replace} className="btn btn-primary btn-xs">
						{t('common.replace-all')}
					</button>
				</ul>
			</details>
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
	console.log('textarea segments => ', segments)
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
					? asVtt(segments, t('common.speaker-prefix'))
					: preference.textFormat === 'srt'
					? asSrt(segments, t('common.speaker-prefix'))
					: preference.textFormat === 'json'
					? asJson(segments)
					: asText(segments, t('common.speaker-prefix'))
			)
		} else {
			setText('')
		}
	}, [preference.textFormat, segments])

	async function download(text: string, format: TextFormat, file: NamedPath) {
		if (format === 'html') {
			text = document.querySelector('.html')!.outerHTML.replace(`contenteditable="true"`, `contenteditable="false"`)
		}
		if (format == 'pdf') {
			window.print()
			return
		}

		const ext = formatExtensions[format].slice(1)
		const defaultPath = await invoke<NamedPath>('get_save_path', { srcPath: file.path, targetExt: ext })
		const filePath = await dialog.save({
			filters: [
				{
					name: ``,
					extensions: [ext],
				},
			],
			canCreateDirectories: true,
			defaultPath: defaultPath.path,
		})

		if (filePath) {
			if (format === 'docx') {
				const fileName = await path.basename(filePath)
				const doc = await toDocx(fileName, segments!, preference.textAreaDirection)
				const arrayBuffer = await doc.arrayBuffer()
				const buffer = new Uint8Array(arrayBuffer)
				fs.writeFile(filePath, buffer)
			} else {
				fs.writeTextFile(filePath, text)
			}

			toast(
				(mytoast) => (
					<span>
						{`${t('common.save-success')}`}
						<button
							onClick={() => {
								toast.dismiss(mytoast.id)
								openPath({ name: '', path: filePath ?? '' })
							}}>
							<div className="link link-primary ms-5">{defaultPath?.name}</div>
						</button>
					</span>
				),
				{
					duration: 5000,
					position: 'bottom-center',
					// icon: '✅',
					iconTheme: {
						primary: '#000',
						secondary: '#fff',
					},
				}
			)
		}
	}

	useEffect(() => {
		replaceBoxVisibleRef.current = replaceBoxVisible
	}, [replaceBoxVisible])

	function onMouseUp(event: MouseEvent) {
		if (!segmentsInFocusRef.current) {
			return
		}
		if (replaceBoxVisibleRef.current) {
			return
		}

		const text = window.getSelection()?.toString()
		if (!text) {
			return
		}

		setSelectedText(text)

		const mouseX = event.pageX
		const mouseY = event.pageY

		const segmentsTextArea = segmentsTextAreaRef.current
		if (!segmentsTextArea) {
			return
		}

		const newPos = { x: mouseX - 10, y: mouseY - 40 }
		setReplaceBoxPos(newPos)

		if (text.length < 100) {
			setReplaceBoxVisible(true)
		}
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
			<div className=" w-full bg-base-200 rounded-tl-lg rounded-tr-lg flex flex-row items-center">
				<Copy text={text} />
				<div className="tooltip tooltip-bottom" data-tip={t('common.save-transcript')}>
					<button onMouseDown={() => download(text, preference.textFormat, file)} className="btn btn-square btn-md">
						<DownloadIcon className="h-6 w-6" />
					</button>
				</div>
				{['html', 'pdf'].includes(preference.textFormat) && (
					<div className="tooltip tooltip-bottom" data-tip={t('common.print-tooltip')}>
						<div onMouseDown={() => window.print()} className={cx('h-full p-2 rounded-lg cursor-pointer')}>
							<PrintIcon className="w-6 h-6" />
						</div>
					</div>
				)}

				<div className="tooltip tooltip-bottom" data-tip={t('common.right-alignment')}>
					<div
						onMouseDown={() => preference.setTextAreaDirection(preference.textAreaDirection === 'rtl' ? 'ltr' : 'rtl')}
						className={cx('h-full p-2 rounded-lg cursor-pointer', preference.textAreaDirection == 'rtl' && 'bg-base-100')}>
						<AlignRightIcon className="w-6 h-6" />
					</div>
				</div>

				<div className="tooltip tooltip-bottom ms-auto me-1" data-tip={t('common.format')}>
					<select
						value={preference.textFormat}
						onChange={(event) => {
							preference.setTextFormat(event.target.value as unknown as TextFormat)
						}}
						className="select select-bordered">
						<option value="normal">{t('common.mode-text')}</option>
						<option value="html">html</option>
						<option value="pdf">pdf</option>
						<option value="docx">docx</option>
						<option value="srt">srt</option>
						<option value="vtt">vtt</option>
						<option value="json">json</option>
					</select>
				</div>
			</div>
			{['html', 'pdf', 'docx'].includes(preference.textFormat) ? (
				<HTMLView preference={preference} segments={segments ?? []} file={file} />
			) : (
				<textarea
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
					className="textarea textarea-bordered w-full h-full text-lg rounded-tl-none rounded-tr-none focus:outline-none"
				/>
			)}
		</div>
	)
}
