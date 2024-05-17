import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import Languages from '~/assets/whisper-languages.json'

export default function LanguageInput({ onChange }: { onChange: (lang: string) => void }) {
	const { t } = useTranslation()
	const [selected, setSelected] = useLocalStorage('transcribe_language', Languages['Auto'])

	const handleChange = (event: any) => {
		setSelected(event.target.value)
		onChange(event.target.value)
	}

	useEffect(() => {
		onChange(selected)
	}, [])

	return (
		<select value={selected} onChange={handleChange} className="select select-bordered">
			{Object.keys(Languages).map((langKey, index) => (
				<option key={index} value={(Languages as any)[langKey]}>
					{langKey === 'Auto' ? t('lang-auto') : t(langKey)}
				</option>
			))}
		</select>
	)
}
