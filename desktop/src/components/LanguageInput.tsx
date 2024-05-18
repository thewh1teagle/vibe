import { ChangeEvent, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import WhisperLanguages from '~/assets/whisper-languages.json'

export default function LanguageInput({ onChange }: { onChange: (lang: string) => void }) {
	const { t } = useTranslation()
	const [selected, setSelected] = useLocalStorage('transcribe_lang_code', 'auto')

	function onLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
		setSelected(event.target.value)
		onChange(event.target.value)
	}

	useEffect(() => {
		onChange(selected)
	}, [])

	// create entries with translated labels
	const entries = Object.entries(WhisperLanguages).map(([name, code]) => {
		return { label: t(`language.${name}`), name, code }
	})
	// sort alphabet
	entries.sort((a, b) => {
		return a.label.localeCompare(b.label)
	})
	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t('common.language')}</span>
			</div>
			<select value={WhisperLanguages[selected as keyof typeof WhisperLanguages]} onChange={onLanguageChange} className="select select-bordered">
				{entries.map(({ label, code }) => (
					<option key={code} value={code}>
						{label}
					</option>
				))}
			</select>
		</label>
	)
}
