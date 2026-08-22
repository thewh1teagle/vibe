import { LEGACY_LOCAL_STORAGE_KEYS } from '~/lib/config-keys'
import { writeConfig, readConfig } from '~/lib/config-store'

/**
 * Move every setting out of `localStorage` and into `app_config.json`.
 *
 * `useLocalStorage` stored JSON, so each value is parsed before it is written; anything unreadable
 * is skipped rather than carried over broken. The old entries are left in place — a user who
 * downgrades keeps their settings, and the migration only runs once anyway.
 */
export function migratePrefsToConfig() {
	for (const [legacyKey, configKey] of Object.entries(LEGACY_LOCAL_STORAGE_KEYS)) {
		const raw = localStorage.getItem(legacyKey)
		if (raw === null) continue
		// Never overwrite a value the config file already holds.
		if (readConfig(configKey, undefined) !== undefined) continue
		try {
			writeConfig(configKey, JSON.parse(raw))
		} catch {
			console.warn('skipping unreadable setting during config migration:', legacyKey)
		}
	}
}
