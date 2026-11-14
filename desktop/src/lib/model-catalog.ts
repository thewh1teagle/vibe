import type { ModelDownload } from './config'
import { getModelExtension } from './model'
import { isNewerVersion } from './version'

export const MODEL_TAGS = ['recommended', 'accurate', 'fast', 'small', 'dictation'] as const
export type ModelTag = (typeof MODEL_TAGS)[number]

/** Stands for "every language" in a model's `languages`, and for the multilingual choice in the picker. */
export const ANY_LANGUAGE = '*'

const BASE_LOCALE = 'en-US'

export interface CatalogModel {
	id: string
	name: string
	/** Lowercase ISO 639-1 codes, or `*` for a multilingual model. */
	languages: string[]
	tags: ModelTag[]
	publisher: { name: string; url?: string }
	license?: string
	url: string
	/** Other addresses of the very same file, tried in order when `url` fails. Only kept when
	 * `sha256` is set, since the hash is what makes them interchangeable. */
	mirrors: string[]
	size?: number
	sha256?: string
	minAppVersion?: string
	/** Locale to text; `en-US` is always present. */
	description: Record<string, string>
}

/** A support file the app downloads on demand (Silero VAD, the diarization model), never listed as a model. */
export interface HelperModel {
	id: string
	filename: string
	url: string
	size: number
	sha256: string
}

/**
 * `helperModels` and `defaults` are top-level keys and `mirrors` a per-model one: releases up to
 * 3.3.5 parse this same file and ignore any key they do not know, so new data has to live there.
 */
export interface ModelCatalog {
	models: CatalogModel[]
	helperModels: HelperModel[]
	/** Language code (or `*`) to the id of the model onboarding downloads for it. */
	defaults: Record<string, string>
}

export const EMPTY_CATALOG: ModelCatalog = { models: [], helperModels: [], defaults: {} }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function httpsUrl(value: unknown, protocols = ['https:']): string | undefined {
	const raw = text(value)
	if (!raw) return undefined
	try {
		return protocols.includes(new URL(raw).protocol) ? raw : undefined
	} catch {
		return undefined
	}
}

function urlFilename(url: string) {
	return new URL(url).pathname.split('/').pop() ?? ''
}

function sha256Hex(value: unknown): string | undefined {
	return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : undefined
}

function positiveSize(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i

/**
 * One catalog entry, or `null` when it cannot be installed safely. The id becomes a filename, so it
 * is held to a strict alphabet; a hash that is present but malformed drops the entry rather than
 * silently installing it unverified.
 */
function normalizeModel(value: unknown): CatalogModel | null {
	if (!isRecord(value)) return null
	const id = text(value.id)
	const name = text(value.name)
	const url = httpsUrl(value.url)
	if (!id || !ID_PATTERN.test(id) || !name || !url || !getModelExtension(urlFilename(url))) return null

	const languages = Array.isArray(value.languages)
		? [...new Set(value.languages.filter((code): code is string => typeof code === 'string' && /^(\*|[a-z]{2,3})$/i.test(code.trim())).map((code) => code.trim().toLowerCase()))]
		: []
	if (languages.length === 0) return null

	const publisher = isRecord(value.publisher) ? text(value.publisher.name) : undefined
	const description = isRecord(value.description)
		? Object.fromEntries(Object.entries(value.description).flatMap(([locale, body]) => (text(body) ? [[locale, text(body) as string]] : [])))
		: {}
	if (!publisher || !description[BASE_LOCALE]) return null

	let sha256: string | undefined
	if (value.sha256 !== undefined && value.sha256 !== null) {
		sha256 = sha256Hex(value.sha256)
		if (!sha256) return null
	}
	const mirrors =
		sha256 && Array.isArray(value.mirrors)
			? [...new Set(value.mirrors.map((mirror) => httpsUrl(mirror)).filter((mirror): mirror is string => !!mirror && mirror !== url && !!getModelExtension(urlFilename(mirror))))]
			: []

	return {
		id,
		name,
		languages,
		tags: Array.isArray(value.tags) ? MODEL_TAGS.filter((tag) => (value.tags as unknown[]).includes(tag)) : [],
		publisher: { name: publisher, url: httpsUrl((value.publisher as Record<string, unknown>).url, ['https:', 'http:']) },
		license: text(value.license),
		url,
		mirrors,
		size: positiveSize(value.size),
		sha256,
		minAppVersion: text(value.minAppVersion),
		description,
	}
}

/**
 * Validate whatever the server (or the bundled file) handed us. Bad entries are dropped one by one;
 * `null` means there is nothing usable and the caller should fall back to another copy.
 */
export function normalizeCatalog(value: unknown): ModelCatalog | null {
	if (!isRecord(value) || !Array.isArray(value.models)) return null
	const seen = new Set<string>()
	const models: CatalogModel[] = []
	for (const entry of value.models) {
		const model = normalizeModel(entry)
		if (!model || seen.has(model.id.toLowerCase())) continue
		seen.add(model.id.toLowerCase())
		models.push(model)
	}
	if (models.length === 0) return null
	return { models, helperModels: normalizeHelperModels(value.helperModels), defaults: normalizeDefaults(value.defaults, models) }
}

/** Support files must be fully pinned: a plain filename, an https address, the exact size and hash. */
function normalizeHelperModels(value: unknown): HelperModel[] {
	if (!Array.isArray(value)) return []
	const result: HelperModel[] = []
	for (const entry of value) {
		if (!isRecord(entry)) continue
		const id = text(entry.id)
		const filename = text(entry.filename)
		const url = httpsUrl(entry.url)
		const size = positiveSize(entry.size)
		const sha256 = sha256Hex(entry.sha256)
		if (!id || !ID_PATTERN.test(id) || !filename || !ID_PATTERN.test(filename) || !url || !size || !sha256) continue
		if (result.some((other) => other.id === id)) continue
		result.push({ id, filename, url, size, sha256 })
	}
	return result
}

function normalizeDefaults(value: unknown, models: CatalogModel[]): Record<string, string> {
	if (!isRecord(value)) return {}
	const defaults: Record<string, string> = {}
	for (const [language, id] of Object.entries(value)) {
		// An upper-case two-letter key is a region (`IL`); anything else is a language code.
		const code = /^[A-Z]{2}$/.test(language.trim()) ? language.trim() : language.trim().toLowerCase()
		if (/^(\*|[a-z]{2,3}|[A-Z]{2})$/.test(code) && typeof id === 'string' && models.some((model) => model.id === id)) defaults[code] = id
	}
	return defaults
}

/** The addresses to try for a catalog model, primary first, with the catalog's size and hash on each. */
export function catalogDownloads(model: CatalogModel): ModelDownload[] {
	return [model.url, ...model.mirrors].map((url) => ({ url, size: model.size, sha256: model.sha256 }))
}

/**
 * The models onboarding tries for a UI locale: the language's own default, then the `*` one, so
 * a failed Hebrew download still leaves the user with a working multilingual model.
 */
export function defaultModelsFor(catalog: ModelCatalog, locale: string | null | undefined): CatalogModel[] {
	const language = toIsoLanguage(locale)
	// Keys are a language (`he`) or an upper-case region (`IL`): an English-language system in Israel
	// still wants the Hebrew model, which the language alone would miss.
	const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? '')?.[1]?.toUpperCase()
	const ids = [...new Set([language ? catalog.defaults[language] : undefined, region ? catalog.defaults[region] : undefined, catalog.defaults[ANY_LANGUAGE]])]
	return ids.flatMap((id) => catalog.models.find((model) => model.id === id) ?? [])
}

/** A support file by id; it ships inside the app, so a missing one is a build error, not a runtime state. */
export function helperModel(catalog: ModelCatalog, id: string): HelperModel {
	const found = catalog.helperModels.find((entry) => entry.id === id)
	if (!found) throw new Error(`The model catalog has no helper model "${id}"`)
	return found
}

/** Codes older software still emits for a language ISO 639-1 has since renamed or split. */
const LANGUAGE_ALIASES: Record<string, string> = { iw: 'he', nb: 'no', nn: 'no', in: 'id', ji: 'yi', jw: 'jv' }

let englishNames: Map<string, string> | null = null

/** "hebrew" → "he". Built from the runtime's own language names rather than a table kept by hand. */
function codeForEnglishName(name: string) {
	if (!englishNames) {
		englishNames = new Map()
		const names = new Intl.DisplayNames(['en'], { type: 'language' })
		const letters = 'abcdefghijklmnopqrstuvwxyz'
		for (const first of letters) {
			for (const second of letters) {
				const code = first + second
				if (LANGUAGE_ALIASES[code]) continue
				const label = names.of(code)
				if (label && label !== code) englishNames.set(label.toLowerCase(), code)
			}
		}
	}
	return englishNames.get(name) ?? null
}

/**
 * The app's language values as ISO 639-1. The transcription language is whatever the model
 * reports (an ISO code, or a lowercase English name from older Whisper files) or `auto`; the UI
 * language is a locale such as `he-IL`. `null` means no particular language.
 */
export function toIsoLanguage(value: string | null | undefined): string | null {
	const raw = value?.trim().toLowerCase()
	if (!raw || raw === 'auto') return null
	const base = raw.replace(/\s*\([^)]*\)$/, '').split(/[-_]/)[0]
	if (/^[a-z]{2}$/.test(base)) return LANGUAGE_ALIASES[base] ?? base
	return codeForEnglishName(base)
}

/** Languages that have a model of their own, which is what the picker offers besides "any". */
export function catalogLanguages(models: CatalogModel[]): string[] {
	return [...new Set(models.flatMap((model) => model.languages))].filter((code) => code !== ANY_LANGUAGE).sort()
}

/** The transcription language, or the UI language when that is `auto`; multilingual when it has no model of its own. */
export function defaultCatalogLanguage(transcriptionLanguage: string | null | undefined, uiLocale: string, models: CatalogModel[]): string {
	const wanted = toIsoLanguage(transcriptionLanguage) ?? toIsoLanguage(uiLocale)
	return wanted && catalogLanguages(models).includes(wanted) ? wanted : ANY_LANGUAGE
}

/** The file a catalog install is saved as. Many upstream files share the name `ggml-model.bin`, the id does not. */
export function catalogFilename(model: CatalogModel): string {
	return `${model.id}.${getModelExtension(urlFilename(model.url)) ?? 'bin'}`
}

/** Drop what this app is too old to run. An unknown app version hides every gated model. */
export function supportedModels(models: CatalogModel[], appVersion: string): CatalogModel[] {
	return models.filter((model) => !model.minAppVersion || !isNewerVersion(model.minAppVersion, appVersion))
}

export interface CatalogView {
	/** The recommended model, then the rest of the models made for the language. */
	primary: CatalogModel[]
	/** The remaining multilingual models, shown under a heading. */
	multilingual: CatalogModel[]
	/** The one model that carries the "Recommended" label in this view. */
	recommendedId: string | null
}

/**
 * What "Get models" lists for a language, in the same order as the website: the single
 * recommended model on top (one made for the language wins over a multilingual one), then the
 * other models for the language, then the other multilingual ones. Installed models stay listed.
 */
export function groupForLanguage(models: CatalogModel[], language: string): CatalogView {
	const isRecommended = (model: CatalogModel) => model.tags.includes('recommended')
	const everyLanguage = models.filter((model) => model.languages.includes(ANY_LANGUAGE))
	const specific = language === ANY_LANGUAGE ? everyLanguage : models.filter((model) => model.languages.includes(language))
	const multilingual = everyLanguage.filter((model) => !specific.includes(model))
	const recommended = specific.find(isRecommended) ?? multilingual.find(isRecommended) ?? null
	return {
		primary: [...(recommended ? [recommended] : []), ...specific.filter((model) => model !== recommended)],
		multilingual: multilingual.filter((model) => model !== recommended),
		recommendedId: recommended?.id ?? null,
	}
}

/**
 * The file in the models folder that holds this catalog model, if any: `<id>.<ext>` from a catalog
 * install, or the upstream filename from an earlier download when no other entry shares that name.
 */
export function installedFilename(models: CatalogModel[], model: CatalogModel, filenames: string[]): string | null {
	const find = (wanted: string) => filenames.find((name) => name.toLowerCase() === wanted.toLowerCase()) ?? null
	const upstream = urlFilename(model.url).toLowerCase()
	const shared = models.some((other) => other.id !== model.id && urlFilename(other.url).toLowerCase() === upstream)
	return find(catalogFilename(model)) ?? (shared ? null : find(upstream))
}

const RTL_LANGUAGES = ['he', 'ar', 'fa', 'ur', 'yi']

/**
 * The description in the UI language, or in English when the catalog has none. The direction
 * belongs to the text actually returned: an English fallback inside a Hebrew UI is still
 * left-to-right, and laying it out otherwise moves its punctuation to the wrong end.
 */
export function describeModel(model: CatalogModel, locale: string): { text: string; dir: 'ltr' | 'rtl' } {
	const shown = model.description[locale] ? locale : BASE_LOCALE
	return { text: model.description[shown], dir: RTL_LANGUAGES.includes(shown.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr' }
}

/**
 * The catalog name of a file in the models folder: one installed from the catalog (`<id>.<ext>`),
 * or one downloaded earlier under its upstream filename. Several entries share upstream names such
 * as `ggml-model.bin`; those stay unnamed rather than guessed.
 */
export function catalogNameForFile(models: CatalogModel[], filename: string): string | null {
	const wanted = filename.toLowerCase()
	const installed = models.find((model) => catalogFilename(model).toLowerCase() === wanted)
	if (installed) return installed.name
	const upstream = models.filter((model) => urlFilename(model.url).toLowerCase() === wanted)
	return upstream.length === 1 ? upstream[0].name : null
}

/** "1.6 GB" / "78 MB", in decimal units like the download pages the files come from. */
export function formatModelSize(bytes: number, locale: string): string {
	const gigabytes = bytes >= 1e9
	const format = (target: string) =>
		new Intl.NumberFormat(target, { style: 'unit', unit: gigabytes ? 'gigabyte' : 'megabyte', maximumFractionDigits: gigabytes ? 1 : 0 }).format(
			gigabytes ? bytes / 1e9 : Math.max(1, bytes / 1e6),
		)
	try {
		return format(locale)
	} catch {
		return format(BASE_LOCALE)
	}
}

/**
 * The backend reports download failures as prose. These are the openings of the two messages
 * `verify_finished_download` (`src-tauri/src/cmd/download.rs`) builds when the finished file is not
 * the one the catalog describes; by then the backend has already deleted it.
 */
const VERIFICATION_FAILURES = ['Corrupt download: expected sha256', 'Incomplete download: expected']

export type InstallFailure = 'verification' | 'other'

export function classifyInstallError(error: unknown): InstallFailure {
	const message = String(error)
	return VERIFICATION_FAILURES.some((marker) => message.includes(marker)) ? 'verification' : 'other'
}
