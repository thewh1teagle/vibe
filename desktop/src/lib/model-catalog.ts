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
	size?: number
	sha256?: string
	minAppVersion?: string
	/** Locale to text; `en-US` is always present. */
	description: Record<string, string>
}

export interface ModelCatalog {
	models: CatalogModel[]
}

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
	if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id) || !name || !url || !getModelExtension(urlFilename(url))) return null

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
		if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.sha256)) return null
		sha256 = value.sha256.toLowerCase()
	}

	return {
		id,
		name,
		languages,
		tags: Array.isArray(value.tags) ? MODEL_TAGS.filter((tag) => (value.tags as unknown[]).includes(tag)) : [],
		publisher: { name: publisher, url: httpsUrl((value.publisher as Record<string, unknown>).url, ['https:', 'http:']) },
		license: text(value.license),
		url,
		size: typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size > 0 ? value.size : undefined,
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
	return models.length > 0 ? { models } : null
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
