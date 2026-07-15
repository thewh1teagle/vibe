// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { localStorageKey } from '~/paraglide/runtime.js'
import { runMigrations } from '.'

describe('local storage migrations', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it('replaces Paraglide fallback English with the legacy locale once', () => {
		localStorage.setItem('prefs_display_language', JSON.stringify('fr-FR'))
		localStorage.setItem(localStorageKey, 'en-US')

		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('fr-FR')
		expect(localStorage.getItem('vibe:migration-version')).toBe('1')

		localStorage.setItem('prefs_display_language', JSON.stringify('he-IL'))
		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('fr-FR')
	})

	it('preserves an existing non-default Paraglide locale', () => {
		localStorage.setItem('prefs_display_language', JSON.stringify('fr-FR'))
		localStorage.setItem(localStorageKey, 'he-IL')

		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('he-IL')
		expect(localStorage.getItem('vibe:migration-version')).toBe('1')
	})
})
