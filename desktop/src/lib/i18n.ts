import { resolveResource } from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'

export const supportedLanguages: { [key: string]: string } = {
	'he-IL': 'Hebrew',
	en: 'English',
	'pt-BR': 'Portuguese',
	'sv-SE': 'Swedish',
}
const languageKeys = Object.keys(supportedLanguages)

i18n.use(LanguageDetector)
	.use(initReactI18next)
	.use(
		resourcesToBackend(async (language: string, _namespace: string) => {
			if (!languageKeys.includes(language)) {
				return
			}
			const file_path = await resolveResource(`./locales/${language}.json`)
			return JSON.parse(await fs.readTextFile(file_path))
		})
	)

	.init({
		debug: false,
		fallbackLng: 'en',
		interpolation: {
			escapeValue: false, // not needed for react as it escapes by default
		},
	})

export default i18n
