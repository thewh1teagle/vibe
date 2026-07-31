import { migrateLegacyLocale } from './migrate-legacy-locale'

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
const migrations = [{ version: 1, run: migrateLegacyLocale }]
const MIGRATION_VERSION_KEY = 'vibe:migration-version'

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
