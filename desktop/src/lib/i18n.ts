import { resolveResource } from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import { locale } from '@tauri-apps/plugin-os'
import i18n, { LanguageDetectorAsyncModule } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'

export const supportedLanguages: { [key: string]: string } = {
	'he-IL': 'hebrew',
	'en-US': 'english',
	'pt-BR': 'portuguese',
	'sv-SE': 'swedish',
	'zh-CN': 'chinese',
	'fr-FR': 'french',
	'pl-PL': 'polish',
	'it-IT': 'italian',
	'hi-IN': 'hindi',
}
export const supportedLanguageKeys = Object.keys(supportedLanguages)
export const supportedLanguageValues = Object.values(supportedLanguages)

export function getI18nLanguageName() {
	const name = supportedLanguages[i18n.language as keyof typeof supportedLanguages]
	return name
}

const LanguageDetector: LanguageDetectorAsyncModule = {
	type: 'languageDetector',
	async: true, // If this is set to true, your detect function receives a callback function that you should call with your language, useful to retrieve your language stored in AsyncStorage for example
	detect: (callback) => {
		locale().then((detectedLocale) => {
			const prefs_language = localStorage.getItem('prefs_display_language')
			if (prefs_language) {
				const locale = JSON.parse(prefs_language)
				callback(locale)
			} else {
				if (detectedLocale) {
					callback(detectedLocale)
				}
			}
		})
	},
}

i18n.use(LanguageDetector)
	.use(initReactI18next)
	.use(
		resourcesToBackend(async (language: string) => {
			if (!supportedLanguageKeys.includes(language)) {
				return
			}
			const resourcePath = `./locales/${language}`
			const languageDirectory = await resolveResource(resourcePath)
			const files = await fs.readDir(languageDirectory)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const translations: any = {}
			await Promise.all(
				files.map(async (file) => {
					const filePath = `${languageDirectory}/${file.name}`
					const namespace = file.name.replace('.json', '')
					const content = await fs.readTextFile(filePath)
					translations[namespace] = JSON.parse(content)
				})
			)
			return translations
		})
	)
	.init({
		debug: false,
		fallbackLng: 'en-US',
		interpolation: {
			escapeValue: false, // not needed for react as it escapes by default
		},
	})
export default i18n
