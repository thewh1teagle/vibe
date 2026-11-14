import { ask, message } from '@tauri-apps/plugin-dialog'
import type { NavigateFunction } from 'react-router-dom'
import { m } from '~/paraglide/messages.js'
import { bundledCatalog, fetchCatalog } from './model-catalog-source'
import { classifyDownloadUrl, extractDownloadUrl, type DownloadLink } from './model-deep-link'
import type { SetupState } from '~/pages/setup/state'

/**
 * Bundled catalog first — its hashes ship inside the signed app. Only an address it does not know
 * is looked up in the published catalog, so a model added after this release still installs
 * verified instead of being labelled unverified.
 */
async function resolve(link: string): Promise<DownloadLink> {
	const url = extractDownloadUrl(link)
	const bundled = classifyDownloadUrl(url, bundledCatalog.models)
	if (bundled.kind !== 'unverified') return bundled
	const live = await fetchCatalog()
	const known = new Set(bundledCatalog.models.map((model) => model.id))
	const extra = live?.models.filter((model) => !known.has(model.id)) ?? []
	return extra.length > 0 ? classifyDownloadUrl(url, extra) : bundled
}

/** Ask, then hand the download to the setup page. Shared by the macOS deep-link and the Windows/Linux argv paths. */
export async function handleDownloadLink(link: string, navigate: NavigateFunction): Promise<void> {
	const result = await resolve(link)
	if (result.kind === 'refused') {
		await message(m.deepLinkRefused({ url: result.url ?? link }), { title: m.downloadModel(), kind: 'error' })
		return
	}
	if (result.kind === 'catalog') {
		const host = new URL(result.url).hostname
		if (!(await ask(`${m.askForDownloadModel()} ${host}?\n\n${result.model.name}`, { title: m.downloadModel(), kind: 'info' }))) return
		const state: SetupState = { downloadURL: result.model.url, catalogModel: result.model }
		navigate('/setup', { state })
		return
	}
	if (!(await ask(m.deepLinkUnverifiedModel({ url: result.url }), { title: m.downloadModel(), kind: 'warning' }))) return
	const state: SetupState = { downloadURL: result.url, select: false }
	navigate('/setup', { state })
}
