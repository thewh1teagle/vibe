import latestRelease from './latest_release.json'

/**
 * The download CTA normally serves the baked latest release, but a `?version=3.1.0`
 * (or `v3.1.0`) query rewrites every asset to that tag — so a link can hand users a
 * specific build (e.g. a beta). The asset URLs/names are fully version-patterned,
 * which makes the rewrite a plain substitution.
 */
const params = new URLSearchParams(window.location.search)
const requested = (params.get('version') ?? '').replace(/^v/, '').trim()
const baseVersion = latestRelease.version.replace(/^v/, '')

export const isVersionOverride = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(requested) && requested !== baseVersion

export const release = isVersionOverride
	? {
			...latestRelease,
			version: `v${requested}`,
			assets: latestRelease.assets.map((asset) => ({
				...asset,
				url: asset.url.split(baseVersion).join(requested),
				name: asset.name.split(baseVersion).join(requested),
			})),
		}
	: latestRelease
