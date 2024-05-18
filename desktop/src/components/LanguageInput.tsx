import { ChangeEvent, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import Languages from '~/assets/whisper-languages.json'

export default function LanguageInput({ onChange }: { onChange: (lang: string) => void }) {
	const { t } = useTranslation()
	const [selected, setSelected] = useLocalStorage('transcribe_language', Languages['auto'])

	function onLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
		setSelected(event.target.value)
		onChange(event.target.value)
	}

	useEffect(() => {
		onChange(selected)
	}, [])

	// create entries with translated labels
	const entries = Object.entries(Languages).map(([language, code]) => {
		return { label: t(`language.${language}`), code }
	})
	// sort alphabet
	entries.sort(({ label: labelA }, { label: labelB }) => {
		return labelA.localeCompare(labelB)
	})

	return (
		<select value={selected} onChange={onLanguageChange} className="select select-bordered">
			{entries.map(({ label, code }) => (
				<option key={code} value={code}>
					{label}
				</option>
			))}
		</select>
	)
}
