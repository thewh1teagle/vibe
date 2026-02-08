import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

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
			<Select value={format} onValueChange={(value) => setFormat(value as TextFormat)}>
				<SelectTrigger>
					<SelectValue placeholder={t('common.mode-text')} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="normal">{t('common.mode-text')}</SelectItem>
					<SelectItem value="srt">srt</SelectItem>
					<SelectItem value="docx">docx</SelectItem>
					<SelectItem value="vtt">vtt</SelectItem>
					<SelectItem value="json">json</SelectItem>
				</SelectContent>
			</Select>
		</div>
	)
}
