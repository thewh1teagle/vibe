import { getLocale } from '~/paraglide/runtime.js'

/** The app language as a word the model understands: "Hebrew", "Français". */
export function appLanguageName() {
	try {
		return new Intl.DisplayNames(['en'], { type: 'language' }).of(getLocale()) ?? 'English'
	} catch {
		return 'English'
	}
}
