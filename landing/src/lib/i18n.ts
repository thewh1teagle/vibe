import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'
import { createI18nStore } from 'svelte-i18next'

i18next
	.use(HttpBackend)
	.use(LanguageDetector)
	.init({
		detection: {
			order: ['localStorage', 'querystring', 'navigator'],
			caches: ['localStorage'],
			lookupQuerystring: 'lng',
			lookupLocalStorage: 'locale',
		},
		fallbackLng: 'en-US',
		// lng: 'en', // testing in dev mode
		supportedLngs: [
			'en-US',
			'he-IL',
			'fr-FR',
			'pl-PL',
			'pt-BR',
			'zh-CN',
			'zh-HK',
			'no-NO',
			'ru-RU',
		],
		ns: 'translation',
		backend: {
			loadPath: 'locales/{{lng}}.json',
		},
		debug: false,
	})

export const i18n = createI18nStore(i18next)
