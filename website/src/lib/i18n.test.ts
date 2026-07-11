import { describe, expect, it } from 'vitest'
import { safeTranslate, supportedWebsiteLocales } from './i18n'

describe('website i18n', () => {
	it('derives website locales from the central registry', () => {
		expect(supportedWebsiteLocales).toContain('en-US')
		expect(supportedWebsiteLocales).toContain('he-IL')
	})

	it('falls back safely when a message is missing', () => {
		expect(safeTranslate({}, 'missing', 'Fallback')).toBe('Fallback')
	})
})
