// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { localStorageKey } from '~/paraglide/runtime.js'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig } from '~/lib/config-store'
import { LATEST_MIGRATION_VERSION, runMigrations } from '.'

describe('local storage migrations', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it('replaces Paraglide fallback English with the legacy locale once', () => {
		localStorage.setItem('prefs_display_language', JSON.stringify('fr-FR'))
		localStorage.setItem(localStorageKey, 'en-US')

		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('fr-FR')
		expect(localStorage.getItem('vibe:migration-version')).toBe(String(LATEST_MIGRATION_VERSION))

		localStorage.setItem('prefs_display_language', JSON.stringify('he-IL'))
		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('fr-FR')
	})

	it('preserves an existing non-default Paraglide locale', () => {
		localStorage.setItem('prefs_display_language', JSON.stringify('fr-FR'))
		localStorage.setItem(localStorageKey, 'he-IL')

		runMigrations()

		expect(localStorage.getItem(localStorageKey)).toBe('he-IL')
		expect(localStorage.getItem('vibe:migration-version')).toBe(String(LATEST_MIGRATION_VERSION))
	})

	it('copies settings out of local storage into the config file', () => {
		localStorage.setItem('prefs_theme', JSON.stringify('dark'))
		localStorage.setItem('prefs_hotkey_shortcut', JSON.stringify('Alt+Space'))
		// Unparseable leftovers are skipped rather than carried over broken.
		localStorage.setItem('prefs_save_transcripts', '{oops')

		runMigrations()

		expect(readConfig(CONFIG_KEYS.theme, null)).toBe('dark')
		expect(readConfig(CONFIG_KEYS.hotkeyShortcut, null)).toBe('Alt+Space')
		expect(readConfig(CONFIG_KEYS.saveTranscripts, 'untouched')).toBe('untouched')
	})
})
