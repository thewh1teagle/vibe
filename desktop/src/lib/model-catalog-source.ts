import { fetch } from '@tauri-apps/plugin-http'
import bundled from '../../../website/public/models.json'
import { modelCatalogURL } from './config'
import { helperModel, EMPTY_CATALOG, normalizeCatalog, type HelperModel, type ModelCatalog } from './model-catalog'

/**
 * The catalog as it was when this app was built: what an offline or blocked machine gets. It ships
 * inside the signed app, so onboarding and support-file downloads take their hashes from here and
 * never from the copy fetched at runtime.
 */
export const bundledCatalog: ModelCatalog = normalizeCatalog(bundled) ?? EMPTY_CATALOG

/** Silero VAD and the diarization model, pinned by the bundled catalog. */
export const bundledHelperModel = (id: 'vad' | 'diarize'): HelperModel => helperModel(bundledCatalog, id)

/** The published catalog, or `null` on any failure; the caller keeps showing the bundled copy. */
export async function fetchCatalog(): Promise<ModelCatalog | null> {
	try {
		const response = await fetch(modelCatalogURL, { method: 'GET', signal: AbortSignal.timeout(10_000) })
		if (!response.ok) return null
		return normalizeCatalog(await response.json())
	} catch (error) {
		console.warn('[models] using the bundled catalog:', error)
		return null
	}
}
