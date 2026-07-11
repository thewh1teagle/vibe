import { describe, expect, it } from 'vitest'
import { safeTranslate, supportedLanguages } from './i18n'

describe('desktop i18n', () => {
	it('derives desktop locales from the central registry', () => {
		expect(supportedLanguages['en-US']).toBe('english')
		expect(supportedLanguages['he-IL']).toBe('hebrew')
	})

	it('calls valid messages and safely falls back for missing ones', () => {
		expect(safeTranslate({ greeting: () => 'Hello' }, 'greeting', 'Fallback')).toBe('Hello')
		expect(safeTranslate({}, 'missing', 'Fallback')).toBe('Fallback')
	})
})
