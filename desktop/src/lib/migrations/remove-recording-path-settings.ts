import { deleteConfig } from '~/lib/config-store'

const obsoleteConfigKeys = ['recording.storeInDocuments', 'recording.customPath']
const obsoleteLocalStorageKeys = ['prefs_store_record_in_documents', 'prefs_custom_recording_path']

/**
 * Recordings now flow into their transcript project. The old recording destination settings are
 * intentionally discarded rather than reused as the projects folder: those choices had a
 * different meaning, and silently repurposing one could move every project unexpectedly.
 */
export function removeRecordingPathSettings() {
	for (const key of obsoleteConfigKeys) deleteConfig(key)
	for (const key of obsoleteLocalStorageKeys) localStorage.removeItem(key)
}
