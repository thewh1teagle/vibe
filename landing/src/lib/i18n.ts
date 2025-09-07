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
		fallbackLng: 'en-US', // English
		// lng: 'en', // testing in dev mode
		// See landing/static/locales/ for the list of supported languages
		// Please keep the list sorted alphabetically
		supportedLngs: [
			'en-US', // English
			'es-MX', // Spanish (MX)
			'fr-FR', // French
			'he-IL', // Hebrew
			'ja-JP', // Japanese
			'ko-KR', // Korean
			'no-NO', // Norwegian
			'pl-PL', // Polish
			'pt-BR', // Portuguese (BR)
			'ru-RU', // Russian
			'zh-CN', // Chinese (Simplified)
			'zh-HK', // Chinese (Traditional)
		],
		ns: 'translation',
		backend: {
			loadPath: 'locales/{{lng}}.json',
		},
		debug: false,
	})

export const i18n = createI18nStore(i18next)
