
import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { createI18nStore, isLoading } from 'svelte-i18next';

i18next
    .use(HttpBackend)
    .use(LanguageDetector)
    .init({
        detection: {
            order: ['querystring', 'localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupQuerystring: 'lng',
            lookupLocalStorage: 'locale'
        },
        fallbackLng: 'en',
        // lng: 'en', // testing in dev mode
        supportedLngs: ['en', 'he'],
        ns: 'translation',
        backend: {
            loadPath: '/locales/{{lng}}.json'
        }
    });

export const i18n = createI18nStore(i18next);