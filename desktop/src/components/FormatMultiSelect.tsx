import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'

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

interface FormatMultiSelectProps {
	formats: TextFormat[]
	setFormats: Dispatch<SetStateAction<TextFormat[]>>
}
export default function FormatMultiSelect({ formats, setFormats }: FormatMultiSelectProps) {
	const { t } = useTranslation()

	const handleFormatButtonClick = (formatOption: TextFormat) => {
		if (formats.includes(formatOption)) {
			setFormats(formats.filter((format) => format !== formatOption))
		} else {
			setFormats([...formats, formatOption])
		}
	}

	return (
		<div className="space-y-2 w-full">
			<Label>{t('common.formats')}</Label>
			<div className="flex flex-wrap gap-2 justify-center">
				{['normal', 'srt', 'docx', 'vtt', 'json'].map((formatOption) => (
					<Button
						type="button"
						key={formatOption}
						size="sm"
						variant={formats.includes(formatOption as TextFormat) ? 'default' : 'outline'}
						onClick={() => handleFormatButtonClick(formatOption as TextFormat)}>
						{formatOption}
					</Button>
				))}
			</div>
		</div>
	)
}
