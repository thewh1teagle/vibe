import { fetch } from '@tauri-apps/plugin-http'
import bundled from '../../../website/public/models.json'
import { modelCatalogURL } from './config'
import { normalizeCatalog, type ModelCatalog } from './model-catalog'

/** The catalog as it was when this app was built: what an offline or blocked machine gets. */
export const bundledCatalog: ModelCatalog = normalizeCatalog(bundled) ?? { models: [] }

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
