import { migrateLegacyLocale } from './migrate-legacy-locale'
import { migratePrefsToConfig } from './migrate-prefs-to-config'

/**
 * Local storage migration versioning
 *
 * Give each migration the next sequential version and append it to the list.
 * Never reuse, reorder, or remove released migrations: users may upgrade from
 * any older Vibe release and must execute every missing migration in order.
 *
 * If a released migration needs a follow-up fix, append another migration.
 * The stored version advances only after a migration succeeds, so keep each
 * migration idempotent to make retries safe.
 */
const migrations = [
	{ version: 1, run: migrateLegacyLocale },
	{ version: 2, run: migratePrefsToConfig },
]
const MIGRATION_VERSION_KEY = 'vibe:migration-version'

/** The version a fully migrated install sits at — the last entry above. */
export const LATEST_MIGRATION_VERSION = migrations[migrations.length - 1].version

function readMigrationVersion() {
	const version = Number(localStorage.getItem(MIGRATION_VERSION_KEY) ?? 0)
	return Number.isInteger(version) && version >= 0 ? version : 0
}

export function runMigrations() {
	let version = readMigrationVersion()

	for (const migration of migrations) {
		if (migration.version <= version) continue

		migration.run()
		version = migration.version
		localStorage.setItem(MIGRATION_VERSION_KEY, String(version))
	}
}
