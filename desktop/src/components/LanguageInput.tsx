import { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { getI18nLanguageName } from '~/lib/i18n'
import { usePreferenceProvider } from '~/providers/Preference'
import { Label } from '~/components/ui/label'
import { NativeSelect } from '~/components/ui/native-select'

const specialModels = [{ pattern: 'ug.bin', languages: [{ code: 'ug', label: 'Uyghur', name: 'uyghur' }] }]

export default function LanguageInput() {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()

	const entries = Object.entries(WhisperLanguages).map(([name, code]) => {
		return { label: t(`language.${name}`, { defaultValue: name }), name, code }
	})

	for (const special of specialModels) {
		if (preference.modelPath?.endsWith(special.pattern)) {
			entries.push(...special.languages)
		}
	}

	entries.sort((a, b) => a.label.localeCompare(b.label))

	function onChange(event: ChangeEvent<HTMLSelectElement>) {
		preference.setModelOptions({ ...preference.modelOptions, lang: event.target.value })
	}

	const popularLanguages = [getI18nLanguageName(), 'auto', 'english']
	const popularEntries: { label: string; code: string }[] = []
	const otherEntries: { label: string; code: string }[] = []

	entries.forEach(({ label, name, code }) => {
		if (popularLanguages.includes(name)) {
			popularEntries.push({ label, code })
		} else {
			otherEntries.push({ label, code })
		}
	})

	return (
		<div className="space-y-2 w-full">
			<Label>{t('common.language')}</Label>
			<NativeSelect value={preference.modelOptions.lang} onChange={onChange}>
				<optgroup label={t('common.popular')}>
					{popularEntries.map(({ label, code }) => (
						<option key={code} value={code}>
							{label}
						</option>
					))}
				</optgroup>
				<optgroup label={t('common.others')}>
					{otherEntries.map(({ label, code }) => (
						<option key={code} value={code}>
							{label}
						</option>
					))}
				</optgroup>
			</NativeSelect>
		</div>
	)
}
