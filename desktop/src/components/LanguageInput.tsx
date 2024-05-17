import { ChangeEvent, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import Languages from '~/assets/whisper-languages.json'

export default function LanguageInput({ onChange }: { onChange: (lang: string) => void }) {
	const { t } = useTranslation()
	const [selected, setSelected] = useLocalStorage('transcribe_language', Languages['Auto'])

	function onLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
		setSelected(event.target.value)
		onChange(event.target.value)
	}

	useEffect(() => {
		onChange(selected)
	}, [])

	return (
		<select value={selected} onChange={onLanguageChange} className="select select-bordered">
			{Object.keys(Languages).map((langKey, index) => (
				<option key={index} value={Languages[langKey as keyof typeof Languages]}>
					{langKey === 'Auto' ? t('lang-auto') : t(langKey)}
				</option>
			))}
		</select>
	)
}
