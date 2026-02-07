import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

i18next
	.use(HttpBackend)
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		detection: {
			order: ['localStorage', 'querystring', 'navigator'],
			caches: ['localStorage'],
			lookupQuerystring: 'lng',
			lookupLocalStorage: 'locale',
		},
		fallbackLng: 'en-US',
		supportedLngs: [
			'en-US', 'es-MX', 'fr-FR', 'he-IL', 'ja-JP', 'ko-KR',
			'no-NO', 'pl-PL', 'pt-BR', 'ru-RU', 'zh-CN', 'zh-HK',
		],
		ns: 'translation',
		backend: {
			loadPath: '/vibe/locales/{{lng}}.json',
		},
	})

export default i18next
