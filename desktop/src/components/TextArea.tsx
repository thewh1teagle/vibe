import * as fs from '@tauri-apps/plugin-fs'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import { Segment, asSrt, asText, asVtt } from '~/lib/transcript'
import { cx } from '~/lib/utils'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as DownloadIcon } from '~/icons/download.svg'
import { ReactComponent as AlignRightIcon } from '~/icons/align-right.svg'

type TextFormat = 'normal' | 'srt' | 'vtt'
type FormatExtensions = {
	[name in TextFormat]: string
}
const formatExtensions: FormatExtensions = {
	normal: '.txt',
	srt: '.srt',
	vtt: '.vtt',
}

async function download(text: string, format: TextFormat) {
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

export default function TextArea({ segments, readonly, placeholder }: { segments: Segment[] | null; readonly: boolean; placeholder?: string }) {
	const { t, i18n } = useTranslation()
	const [direction, setDirection] = useLocalStorage<'ltr' | 'rtl'>('direction', i18n.dir())
	const [format, setFormat] = useLocalStorage<TextFormat>('format', 'normal')
	const [text, setText] = useState('')

	useEffect(() => {
		if (segments) {
			setText(format === 'vtt' ? asVtt(segments) : format === 'srt' ? asSrt(segments) : asText(segments))
		} else {
			setText('')
		}
	}, [format, segments])

	return (
		<div className="w-full h-full">
			<div className=" w-full bg-base-200 rounded-tl-lg rounded-tr-lg flex flex-row items-center">
				<button className="btn btn-square btn-md" onMouseDown={() => navigator.clipboard.writeText(text)}>
					<CopyIcon className="h-6 w-6" />
				</button>
				<button onMouseDown={() => download(text, format)} className="btn btn-square btn-md">
					<DownloadIcon className="h-6 w-6" />
				</button>
				<div
					onMouseDown={() => setDirection(direction === 'rtl' ? 'ltr' : 'rtl')}
					className={cx('h-full p-2 rounded-lg cursor-pointer', direction == 'rtl' && 'bg-base-100')}>
					<AlignRightIcon className="w-6 h-6" />
				</div>

				<select
					value={format}
					onChange={(e) => {
						setFormat(e.target.value as any)
					}}
					className="select select-bordered ms-auto me-1.5">
					<option value="normal">{t('mode-text')}</option>
					<option value="srt">SRT</option>
					<option value="vtt">VTT</option>
				</select>
			</div>
			<textarea
				placeholder={placeholder}
				readOnly={readonly}
				autoCorrect="off"
				spellCheck={false}
				onChange={(e) => setText(e.target.value)}
				value={text}
				dir={direction}
				className="textarea textarea-bordered w-full h-full text-lg rounded-tl-none rounded-tr-none focus:outline-none"
			/>
		</div>
	)
}
