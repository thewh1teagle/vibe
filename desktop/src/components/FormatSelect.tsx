import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

export type TextFormat = 'normal' | 'srt' | 'vtt' | 'html' | 'pdf' | 'json'
export type FormatExtensions = {
	[name in TextFormat]: string
}
export const formatExtensions: FormatExtensions = {
	normal: '.txt',
	srt: '.srt',
	vtt: '.vtt',
	html: '.html',
	pdf: '.pdf',
	json: '.json',
}

interface FormatSelectProps {
	format: TextFormat
	setFormat: Dispatch<SetStateAction<TextFormat>>
}
export default function FormatSelect({ format, setFormat }: FormatSelectProps) {
	const { t } = useTranslation()
	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t('common.format')}</span>
			</div>
			<select
				value={format}
				onChange={(event) => {
					setFormat(event.target.value as unknown as TextFormat)
				}}
				className="select select-bordered">
				<option value="normal">{t('common.mode-text')}</option>
				<option value="srt">SRT</option>
				<option value="vtt">VTT</option>
				<option value="json">JSON</option>
			</select>
		</label>
	)
}
