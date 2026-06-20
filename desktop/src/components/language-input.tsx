import { useTranslation } from 'react-i18next'
import { usePreferenceProvider } from '~/providers/preference'
import { transcriptionLanguages } from '~/lib/config'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

export default function LanguageInput() {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()

	return (
		<div className="space-y-2 w-full">
			<Label>{t('common.language')}</Label>
			<Select value={preference.modelOptions.lang} onValueChange={(value) => preference.setModelOptions({ ...preference.modelOptions, lang: value })}>
				<SelectTrigger>
					<SelectValue placeholder={t('common.language')} />
				</SelectTrigger>
				<SelectContent>
					{transcriptionLanguages.map(({ code, label }) => (
						<SelectItem key={code} value={code}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
