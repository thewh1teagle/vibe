import { baseLocale, isLocale, localStorageKey, setLocale } from '~/paraglide/runtime.js'

const LEGACY_LOCALE_KEY = 'prefs_display_language'

export function migrateLegacyLocale() {
	const legacyLocale = localStorage.getItem(LEGACY_LOCALE_KEY)
	if (legacyLocale === null) return

	try {
		const locale: unknown = JSON.parse(legacyLocale)
		const paraglideLocale = localStorage.getItem(localStorageKey)
		const shouldMigrate =
			paraglideLocale === null || paraglideLocale === baseLocale || !isLocale(paraglideLocale)
		if (isLocale(locale) && paraglideLocale !== locale && shouldMigrate) {
			setLocale(locale, { reload: false })
		}
	} catch {
		// Ignore malformed legacy preferences and keep Paraglide's base locale.
	}
}
