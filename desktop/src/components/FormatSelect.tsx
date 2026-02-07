import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '~/components/ui/label'
import { NativeSelect } from '~/components/ui/native-select'

export type TextFormat = 'normal' | 'srt' | 'vtt' | 'html' | 'pdf' | 'json' | 'docx'
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
	docx: '.docx',
}

interface FormatSelectProps {
	format: TextFormat
	setFormat: Dispatch<SetStateAction<TextFormat>>
}

export default function FormatSelect({ format, setFormat }: FormatSelectProps) {
	const { t } = useTranslation()
	return (
		<div className="space-y-2 w-full">
			<Label>{t('common.format')}</Label>
			<NativeSelect value={format} onChange={(event) => setFormat(event.target.value as TextFormat)}>
				<option value="normal">{t('common.mode-text')}</option>
				<option value="srt">srt</option>
				<option value="docx">docx</option>
				<option value="vtt">vtt</option>
				<option value="json">json</option>
			</NativeSelect>
		</div>
	)
}
