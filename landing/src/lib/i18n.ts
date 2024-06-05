import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'
import { createI18nStore } from 'svelte-i18next'

i18next
	.use(HttpBackend)
	.use(LanguageDetector)
	.init({
		detection: {
			order: ['querystring', 'localStorage', 'navigator'],
			caches: ['localStorage'],
			lookupQuerystring: 'lng',
			lookupLocalStorage: 'locale',
		},
		fallbackLng: 'en-US',
		// lng: 'en', // testing in dev mode
		supportedLngs: ['en-US', 'he-IL', 'fr-FR'],
		ns: 'translation',
		backend: {
			loadPath: 'locales/{{lng}}.json',
		},
	})

export const i18n = createI18nStore(i18next)
