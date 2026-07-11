import { Dispatch, SetStateAction } from 'react'
import { m } from '~/paraglide/messages.js'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

export type TextFormat = 'normal' | 'srt' | 'vtt' | 'html' | 'pdf' | 'json' | 'docx' | 'csv' | 'md'
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
	csv: '.csv',
	md: '.md',
}

interface FormatSelectProps {
	format: TextFormat
	setFormat: Dispatch<SetStateAction<TextFormat>>
}

export default function FormatSelect({ format, setFormat }: FormatSelectProps) {
	return (
		<div className="space-y-2 w-full">
			<Label>{m.format()}</Label>
			<Select value={format} onValueChange={(value) => setFormat(value as TextFormat)}>
				<SelectTrigger>
					<SelectValue placeholder={m.modeText()} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="normal">{m.modeText()}</SelectItem>
					<SelectItem value="srt">srt</SelectItem>
					<SelectItem value="docx">docx</SelectItem>
					<SelectItem value="vtt">vtt</SelectItem>
					<SelectItem value="json">json</SelectItem>
					<SelectItem value="csv">csv</SelectItem>
				</SelectContent>
			</Select>
		</div>
	)
}
