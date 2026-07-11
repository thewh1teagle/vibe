import localeRegistry from '../../../i18n/locales.json'
import { getLocale } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'

type MessageFunction = (params?: Record<string, unknown>) => unknown

export const supportedLanguages = Object.fromEntries(localeRegistry.filter((locale) => locale.desktop).map(({ code, name }) => [code, name]))
export const supportedLanguageKeys = Object.keys(supportedLanguages)
export const supportedLanguageValues = Object.values(supportedLanguages)

export function getI18nLanguageName() {
	return supportedLanguages[getLocale()]
}

export function getLocalizedLanguageName(name: string) {
	const baseName = name.replace(/\s*\([^)]*\)$/, '')
	const key = `language${baseName.toLowerCase().replace(/[^a-z]/g, '')}`
	return safeTranslate(m, key, name)
}

export function safeTranslate(messages: Record<string, unknown>, key: string, fallback: string, params?: Record<string, unknown>) {
	const message = messages[key]
	return typeof message === 'function' ? String((message as MessageFunction)(params)) : fallback
}
