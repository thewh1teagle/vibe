// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { localStorageKey } from '~/paraglide/runtime.js'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig, writeConfig } from '~/lib/config-store'
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

	it('deletes obsolete recording destination settings without migrating them', () => {
		localStorage.setItem('vibe:migration-version', '2')
		localStorage.setItem('prefs_store_record_in_documents', JSON.stringify(true))
		localStorage.setItem('prefs_custom_recording_path', JSON.stringify('/old/recordings'))
		writeConfig('recording.storeInDocuments', true)
		writeConfig('recording.customPath', '/old/recordings')

		runMigrations()

		expect(readConfig('recording.storeInDocuments', 'removed')).toBe('removed')
		expect(readConfig('recording.customPath', 'removed')).toBe('removed')
		expect(readConfig(CONFIG_KEYS.projectsPath, 'not-migrated')).toBe('not-migrated')
		expect(localStorage.getItem('prefs_store_record_in_documents')).toBeNull()
		expect(localStorage.getItem('prefs_custom_recording_path')).toBeNull()
	})
})
