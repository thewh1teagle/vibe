import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as AlignRightIcon } from '~/icons/align-right.svg'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as DownloadIcon } from '~/icons/download.svg'
import { Segment, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, cx } from '~/lib/utils'
import { TextFormat, formatExtensions } from './FormatSelect'
import { usePreferencesContext } from '~/providers/Preferences'
import HTMLView from './HtmlView'

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

async function download(text: string, format: TextFormat) {
	if (format === 'html') {
		text = document.querySelector('.html')!.outerHTML
	}
	const ext = formatExtensions[format].slice(1)
	const filePath = await dialog.save({
		filters: [
			{
				name: '',
				extensions: [ext],
			},
		],
	})
	if (filePath) {
		fs.writeTextFile(filePath, text)
	}
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
	const preferences = usePreferencesContext()
	const [text, setText] = useState('')

	useEffect(() => {
		if (segments) {
			setText(preferences.textFormat === 'vtt' ? asVtt(segments) : preferences.textFormat === 'srt' ? asSrt(segments) : asText(segments))
		} else {
			setText('')
		}
	}, [preferences.textFormat, segments])

	return (
		<div className="w-full h-full">
			<div className=" w-full bg-base-200 rounded-tl-lg rounded-tr-lg flex flex-row items-center">
				<Copy text={text} />
				<div className="tooltip tooltip-bottom" data-tip={t('common.save-transcript')}>
					<button onMouseDown={() => download(text, preferences.textFormat)} className="btn btn-square btn-md">
						<DownloadIcon className="h-6 w-6" />
					</button>
				</div>
				<div className="tooltip tooltip-bottom" data-tip={t('common.right-alignment')}>
					<div
						onMouseDown={() => preferences.setTextAreaDirection(preferences.textAreaDirection === 'rtl' ? 'ltr' : 'rtl')}
						className={cx('h-full p-2 rounded-lg cursor-pointer', preferences.textAreaDirection == 'rtl' && 'bg-base-100')}>
						<AlignRightIcon className="w-6 h-6" />
					</div>
				</div>

				<div className="tooltip tooltip-bottom ms-auto me-1" data-tip={t('common.format')}>
					<select
						value={preferences.textFormat}
						onChange={(event) => {
							preferences.setTextFormat(event.target.value as unknown as TextFormat)
						}}
						className="select select-bordered">
						<option value="normal">{t('common.mode-text')}</option>
						<option value="html">{t('common.print')}</option>
						<option value="srt">SRT</option>
						<option value="vtt">VTT</option>
					</select>
				</div>
			</div>
			{preferences.textFormat === 'html' ? (
				<HTMLView dir={preferences.textAreaDirection} segments={segments ?? []} file={file} />
			) : (
				<textarea
					placeholder={placeholder}
					readOnly={readonly}
					autoCorrect="off"
					spellCheck={false}
					onChange={(e) => setText(e.target.value)}
					value={text}
					dir={preferences.textAreaDirection}
					className="textarea textarea-bordered w-full h-full text-lg rounded-tl-none rounded-tr-none focus:outline-none"
				/>
			)}
		</div>
	)
}
