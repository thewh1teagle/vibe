import localeRegistry from '../../../i18n/locales.json'

type MessageFunction = (params?: Record<string, unknown>) => unknown

export const supportedWebsiteLocales = localeRegistry.filter((locale) => locale.website).map(({ code }) => code)

export function safeTranslate(messages: Record<string, unknown>, key: string, fallback: string, params?: Record<string, unknown>) {
	const message = messages[key]
	return typeof message === 'function' ? String((message as MessageFunction)(params)) : fallback
}
