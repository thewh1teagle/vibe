import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import bundled from '../../../website/public/models.json'
import { diarizeModelFilename, vadModelFilename } from './config'
import { helperModel, catalogDownloads, defaultModelsFor, normalizeCatalog } from './model-catalog'

/**
 * The accept/reject rules of `normalizeCatalog` as shipped up to 3.3.5
 * (`git show 93da97ac:desktop/src/lib/model-catalog.ts`), copied with only the display-only fields
 * left out. Those apps fetch this same models.json from the website, so every model must still pass.
 * Do not update this copy when the parser changes: it stands for software already installed.
 */
const legacy = (() => {
	const MODEL_TAGS = ['recommended', 'accurate', 'fast', 'small', 'dictation']
	const getModelExtension = (filename: string) => filename.match(/\.(bin|gguf)$/i)?.[1]?.toLowerCase() ?? null
	const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
	const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
	function httpsUrl(value: unknown, protocols = ['https:']): string | undefined {
		const raw = text(value)
		if (!raw) return undefined
		try {
			return protocols.includes(new URL(raw).protocol) ? raw : undefined
		} catch {
			return undefined
		}
	}
	const urlFilename = (url: string) => new URL(url).pathname.split('/').pop() ?? ''

	function normalizeModel(value: unknown) {
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
		if (!publisher || !description['en-US']) return null
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
			url,
			size: typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size > 0 ? value.size : undefined,
			sha256,
		}
	}

	function normalizeCatalog(value: unknown) {
		if (!isRecord(value) || !Array.isArray(value.models)) return null
		const seen = new Set<string>()
		const models: NonNullable<ReturnType<typeof normalizeModel>>[] = []
		for (const entry of value.models) {
			const model = normalizeModel(entry)
			if (!model || seen.has(model.id.toLowerCase())) continue
			seen.add(model.id.toLowerCase())
			models.push(model)
		}
		return models.length > 0 ? { models } : null
	}
	return { normalizeCatalog }
})()

describe('models.json and apps already installed', () => {
	it('still parses with the 3.3.5 parser, every model intact', () => {
		const old = legacy.normalizeCatalog(bundled)
		expect(old?.models.map((model) => model.id)).toEqual(bundled.models.map((model) => model.id))
		for (const model of old?.models ?? []) {
			const source = bundled.models.find((entry) => entry.id === model.id)!
			expect(model).toMatchObject({ url: source.url, size: source.size, sha256: source.sha256 })
		}
	})

	it('keeps the new data where the old parser does not look', () => {
		const old = legacy.normalizeCatalog(bundled)
		expect(Object.keys(old ?? {})).toEqual(['models'])
		expect(old?.models.every((model) => !('mirrors' in model))).toBe(true)
	})
})

describe('catalog additions', () => {
	const catalog = normalizeCatalog(bundled)!

	it('lists the turbo mirrors under the same hash', () => {
		const turbo = catalog.models.find((model) => model.id === 'whisper-large-v3-turbo')!
		const downloads = catalogDownloads(turbo)
		expect(downloads.map((download) => new URL(download.url).hostname)).toEqual(['huggingface.co', 'huggingface.co', 'github.com'])
		expect(downloads.every((download) => download.sha256 === turbo.sha256 && download.size === turbo.size)).toBe(true)
	})

	it('pins both support files, under the filenames the app and the backend use', () => {
		expect(helperModel(catalog, 'vad').filename).toBe(vadModelFilename)
		expect(helperModel(catalog, 'diarize').filename).toBe(diarizeModelFilename)
		const rust = readFileSync(new URL('../../src-tauri/src/handoff/transcribe.rs', import.meta.url), 'utf8')
		expect(rust).toContain(`VAD_MODEL_FILENAME: &str = "${vadModelFilename}"`)
		for (const entry of catalog.helperModels) expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
	})

	it('picks the onboarding model by language, with the multilingual one as fallback', () => {
		const ids = (locale: string | null) => defaultModelsFor(catalog, locale).map((model) => model.id)
		expect(ids('he-IL')).toEqual(['whisper-large-v3-turbo-he', 'whisper-large-v3-turbo'])
		expect(ids('en-US')).toEqual(['whisper-large-v3-turbo'])
		// An English-language system in Israel still gets the Hebrew model first.
		expect(ids('en-IL')).toEqual(['whisper-large-v3-turbo-he', 'whisper-large-v3-turbo'])
		expect(ids('en_IL')).toEqual(['whisper-large-v3-turbo-he', 'whisper-large-v3-turbo'])
		expect(ids(null)).toEqual(['whisper-large-v3-turbo'])
	})

	it('drops mirrors without a hash, bad helper entries and defaults that name no model', () => {
		const model = (overrides: Record<string, unknown>) => ({
			id: 'm',
			name: 'M',
			languages: ['*'],
			publisher: { name: 'P' },
			url: 'https://huggingface.co/a/b/resolve/main/m.bin',
			description: { 'en-US': 'x' },
			...overrides,
		})
		const parsed = normalizeCatalog({
			models: [model({ mirrors: ['https://github.com/a/m.bin'] }), model({ id: 'h', sha256: 'ab'.repeat(32), mirrors: ['http://x.test/m.bin', 'https://github.com/a/m.bin', 'https://github.com/a/m.zip'] })],
			helperModels: [
				{ id: 'vad', filename: '../x.bin', url: 'https://huggingface.co/x.bin', size: 1, sha256: 'ab'.repeat(32) },
				{ id: 'vad', filename: 'x.bin', url: 'https://huggingface.co/x.bin', size: 1 },
				{ id: 'ok', filename: 'x.bin', url: 'https://huggingface.co/x.bin', size: 1, sha256: 'AB'.repeat(32) },
			],
			defaults: { '*': 'h', he: 'missing', 'not a code': 'm' },
		})!
		expect(parsed.models.map((entry) => entry.mirrors)).toEqual([[], ['https://github.com/a/m.bin']])
		expect(parsed.helperModels).toEqual([{ id: 'ok', filename: 'x.bin', url: 'https://huggingface.co/x.bin', size: 1, sha256: 'ab'.repeat(32) }])
		expect(parsed.defaults).toEqual({ '*': 'h' })
		expect(() => helperModel(parsed, 'vad')).toThrow()
	})
})
