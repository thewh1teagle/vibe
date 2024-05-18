import { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import WhisperLanguages from '~/assets/whisper-languages.json'

interface LanguageInputProps {
	lang: string
	setLang: (lang: string) => void
}
export default function LanguageInput({ lang, setLang }: LanguageInputProps) {
	const { t } = useTranslation()

	// create entries with translated labels
	const entries = Object.entries(WhisperLanguages).map(([name, code]) => {
		return { label: t(`language.${name}`), name, code }
	})
	// sort alphabet
	entries.sort((a, b) => {
		return a.label.localeCompare(b.label)
	})
	function onChange(event: ChangeEvent<HTMLSelectElement>) {
		setLang(event.target.value)
	}
	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t('common.language')}</span>
			</div>
			<select value={WhisperLanguages[lang as keyof typeof WhisperLanguages]} onChange={onChange} className="select select-bordered">
				{entries.map(({ label, code }) => (
					<option key={code} value={code}>
						{label}
					</option>
				))}
			</select>
		</label>
	)
}
