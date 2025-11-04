import { invoke } from '@tauri-apps/api/core'
import { locale } from '@tauri-apps/plugin-os'
import i18n, { LanguageDetectorAsyncModule } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'

// See src-tauri/locales/ for the list of supported languages
// Please keep the list sorted alphabetically
export const supportedLanguages: { [key: string]: string } = {
	'en-US': 'english', // English
	'es-ES': 'spanish (ES)', // Spanish (ES)
	'es-MX': 'spanish (MX)', // Spanish (MX)
	'fr-FR': 'french', // French
	'he-IL': 'hebrew', // Hebrew
	'hi-IN': 'hindi', // Hindi
	'it-IT': 'italian', // Italian
	'ja-JP': 'japanese', // Japanese
	'ko-KR': 'korean', // Korean
	'no-NO': 'norwegian', // Norwegian
	'pl-PL': 'polish', // Polish
	'pt-BR': 'portuguese', // Portuguese (BR)
	'ru-RU': 'russian', // Russian
	'sv-SE': 'swedish', // Swedish
	'ta-IN': 'tamil', // Tamil
	'vi-VN': 'vietnamese', // Vietnamese
	'zh-CN': 'chinese', // Chinese (Simplified)
	'zh-HK': 'chinese (HK)', // Chinese (Traditional)
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
			console.log('Detected system locale:', detectedLocale)
			const prefs_language = localStorage.getItem('prefs_display_language')
			console.log('Stored language preference:', prefs_language)
			if (prefs_language) {
				const locale = JSON.parse(prefs_language)
				console.log('Using stored preference:', locale)
				callback(locale)
			} else {
				console.log('Using detected locale:', detectedLocale)
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
			try {
				// Use invoke to read translation files from Rust side
				const translations: any = {}

				// Read common.json and language.json
				const namespaces = ['common', 'language']
				await Promise.all(
					namespaces.map(async (namespace) => {
						try {
							const content = await invoke('read_translation_file', { language, namespace })
							translations[namespace] = JSON.parse(content as string)
						} catch (error) {
							console.warn(`Failed to load ${namespace} translations:`, error)
						}
					})
				)

				return translations
			} catch (error) {
				console.error('i18n resource loading failed:', error)
				return {}
			}
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
