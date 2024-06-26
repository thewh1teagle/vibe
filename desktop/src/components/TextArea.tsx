import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as AlignRightIcon } from '~/icons/align-right.svg'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as DownloadIcon } from '~/icons/download.svg'
import { ReactComponent as PrintIcon } from '~/icons/print.svg'
import { Segment, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, cx, openPath } from '~/lib/utils'
import { TextFormat, formatExtensions } from './FormatSelect'
import { usePreferenceProvider } from '~/providers/Preference'
import HTMLView from './HtmlView'
import toast from 'react-hot-toast'
import { invoke } from '@tauri-apps/api/core'

function Copy({ text }: { text: string }) {
	const { t } = useTranslation()
	const [info, setInfo] = useState(t('common.copy'))

	function onCopy() {
		navigator.clipboard.writeText(text)
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

export default function TextArea({
	segments,
	readonly,
	placeholder,
	file,
}: {
	segments: Segment[] | null
	readonly: boolean
	placeholder?: string
	file: NamedPath
}) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()
	const [text, setText] = useState('')

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
			fs.writeTextFile(filePath, text)

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

	return (
		<div className="w-full h-full">
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
						<option value="html">HTML</option>
						<option value="pdf">PDF</option>
						<option value="srt">SRT</option>
						<option value="vtt">VTT</option>
						<option value="json">JSON</option>
					</select>
				</div>
			</div>
			{['html', 'pdf'].includes(preference.textFormat) ? (
				<HTMLView preference={preference} segments={segments ?? []} file={file} />
			) : (
				<textarea
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
