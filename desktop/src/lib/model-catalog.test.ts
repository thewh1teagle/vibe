import { describe, expect, it } from 'vitest'
import bundled from '../../../website/public/models.json'
import {
	catalogFilename,
	catalogLanguages,
	catalogNameForFile,
	classifyInstallError,
	defaultCatalogLanguage,
	describeModel,
	formatModelSize,
	groupForLanguage,
	installedFilename,
	normalizeCatalog,
	supportedModels,
	toIsoLanguage,
	type CatalogModel,
} from './model-catalog'

const SHA = 'ab'.repeat(32)

function entry(overrides: Record<string, unknown> = {}) {
	return {
		id: 'whisper-large-v3-turbo',
		name: 'Whisper Large v3 Turbo',
		languages: ['*'],
		tags: ['recommended', 'accurate'],
		publisher: { name: 'OpenAI', url: 'https://huggingface.co/openai/whisper-large-v3-turbo' },
		license: 'MIT',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
		size: 1624555275,
		sha256: SHA,
		description: { 'en-US': 'The all-rounder.', 'he-IL': 'הכול-יכול.' },
		...overrides,
	}
}

function models(...entries: unknown[]): CatalogModel[] {
	return normalizeCatalog({ models: entries })?.models ?? []
}

const turbo = entry()
const tiny = entry({ id: 'whisper-tiny', name: 'Whisper Tiny', tags: ['small'], url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' })
const ivrit = entry({
	id: 'whisper-large-v3-turbo-he',
	languages: ['he'],
	url: 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin',
})
const parakeetHe = entry({
	id: 'parakeet-tdt-0.6b-v3-he',
	languages: ['he'],
	tags: ['fast', 'dictation'],
	minAppVersion: '3.0.22',
	url: 'https://huggingface.co/vibe-app/parakeet-tdt-0.6b-v3-he-gguf/resolve/main/parakeet-tdt-0.6b-v3-he-q8_0.gguf?download=true',
})
const norwegian = entry({ id: 'nb-whisper-large', languages: ['no'], url: 'https://huggingface.co/NbAiLab/nb-whisper-large/resolve/main/ggml-model.bin' })

describe('normalizeCatalog', () => {
	it('accepts the catalog the website publishes, entry for entry', () => {
		const catalog = normalizeCatalog(bundled)
		expect(catalog?.models.map((model) => model.id)).toEqual(bundled.models.map((model) => model.id))
		expect(new Set(catalog?.models.map(catalogFilename)).size).toBe(bundled.models.length)
	})

	it('rejects anything that is not a catalog', () => {
		for (const value of [null, undefined, 'models', [], {}, { models: {} }, { models: [] }, { models: [{ id: 'x' }] }]) {
			expect(normalizeCatalog(value)).toBeNull()
		}
	})

	it('ignores unknown fields and unknown tags', () => {
		const [model] = models(entry({ tags: ['fast', 'shiny', 7, 'recommended'], engine: 'whisper', publisher: { name: 'OpenAI', url: 'https://x.test', verified: true } }))
		expect(model.tags).toEqual(['recommended', 'fast'])
		expect(model).not.toHaveProperty('engine')
		expect(model.publisher).toEqual({ name: 'OpenAI', url: 'https://x.test' })
	})

	it('drops the entries it cannot install and keeps the rest', () => {
		const kept = models(
			turbo,
			entry({ id: '../escape' }),
			entry({ id: 'no-name', name: ' ' }),
			entry({ id: 'plain-http', url: 'http://example.com/model.bin' }),
			entry({ id: 'not-a-model', url: 'https://example.com/model.zip' }),
			entry({ id: 'bad-hash', sha256: 'abc' }),
			entry({ id: 'no-languages', languages: [] }),
			entry({ id: 'no-english', description: { 'he-IL': 'רק עברית' } }),
			entry({ id: 'no-publisher', publisher: null }),
			entry({ id: 'WHISPER-LARGE-V3-TURBO' }),
			'nonsense',
			tiny,
		)
		expect(kept.map((model) => model.id)).toEqual(['whisper-large-v3-turbo', 'whisper-tiny'])
	})

	it('treats the optional fields as optional', () => {
		const [model] = models(entry({ sha256: undefined, size: '12', license: undefined, minAppVersion: undefined, tags: undefined, languages: ['HE', 'he', 'hebrew!'] }))
		expect(model).toMatchObject({ sha256: undefined, size: undefined, license: undefined, minAppVersion: undefined, tags: [], languages: ['he'] })
	})

	it('lowercases the hash, which the backend compares case-insensitively anyway', () => {
		expect(models(entry({ sha256: SHA.toUpperCase() }))[0].sha256).toBe(SHA)
	})
})

describe('toIsoLanguage', () => {
	it('maps the values the app stores to ISO 639-1', () => {
		expect(toIsoLanguage('he')).toBe('he')
		expect(toIsoLanguage('he-IL')).toBe('he')
		expect(toIsoLanguage('zh_HK')).toBe('zh')
		expect(toIsoLanguage('EN')).toBe('en')
		expect(toIsoLanguage('hebrew')).toBe('he')
		expect(toIsoLanguage('Norwegian')).toBe('no')
		expect(toIsoLanguage('spanish (MX)')).toBe('es')
	})

	it('folds retired and regional codes into the one the catalog uses', () => {
		expect(toIsoLanguage('iw')).toBe('he')
		expect(toIsoLanguage('nb-NO')).toBe('no')
		expect(toIsoLanguage('nn')).toBe('no')
	})

	it('has no language for auto-detect, nothing, or nonsense', () => {
		for (const value of ['auto', '', '  ', null, undefined, 'klingonese']) expect(toIsoLanguage(value)).toBeNull()
	})
})

describe('language choice', () => {
	const all = models(turbo, tiny, ivrit, parakeetHe, norwegian)

	it('lists only the languages with a model of their own', () => {
		expect(catalogLanguages(all)).toEqual(['he', 'no'])
	})

	it('starts on the transcription language, or the UI language when that is auto', () => {
		expect(defaultCatalogLanguage('he', 'en-US', all)).toBe('he')
		expect(defaultCatalogLanguage('auto', 'no-NO', all)).toBe('no')
		expect(defaultCatalogLanguage('norwegian', 'en-US', all)).toBe('no')
	})

	it('falls back to the multilingual group for a language without its own model', () => {
		expect(defaultCatalogLanguage('fr', 'he-IL', all)).toBe('*')
		expect(defaultCatalogLanguage('auto', 'en-US', all)).toBe('*')
	})
})

describe('groupForLanguage', () => {
	const parakeet = entry({ id: 'parakeet', languages: ['en', 'sv'], tags: ['fast'], url: 'https://example.com/parakeet.gguf' })
	const swedish = entry({ id: 'kb-whisper-large', languages: ['sv'], url: 'https://example.com/sv/ggml-model.bin' })
	const all = models(tiny, parakeetHe, parakeet, turbo, norwegian, ivrit, swedish)
	const view = (language: string) => {
		const { primary, multilingual, recommendedId } = groupForLanguage(all, language)
		return { primary: primary.map((model) => model.id), multilingual: multilingual.map((model) => model.id), recommendedId }
	}

	it('puts the recommended model for the language on top, then its other models, then the multilingual ones in catalog order', () => {
		expect(view('he')).toEqual({
			primary: ['whisper-large-v3-turbo-he', 'parakeet-tdt-0.6b-v3-he'],
			multilingual: ['whisper-tiny', 'whisper-large-v3-turbo'],
			recommendedId: 'whisper-large-v3-turbo-he',
		})
		expect(view('sv')).toEqual({
			primary: ['kb-whisper-large', 'parakeet'],
			multilingual: ['whisper-tiny', 'whisper-large-v3-turbo'],
			recommendedId: 'kb-whisper-large',
		})
	})

	it('lifts the multilingual recommendation above everything when the language has none of its own', () => {
		expect(view('en')).toEqual({ primary: ['whisper-large-v3-turbo', 'parakeet'], multilingual: ['whisper-tiny'], recommendedId: 'whisper-large-v3-turbo' })
	})

	it('shows only the multilingual models for "any language", with no divider group', () => {
		expect(view('*')).toEqual({ primary: ['whisper-large-v3-turbo', 'whisper-tiny'], multilingual: [], recommendedId: 'whisper-large-v3-turbo' })
	})

	it('never lists a model twice and copes with no recommendation at all', () => {
		const both = groupForLanguage(models(entry({ languages: ['*', 'he'] }), tiny), 'he')
		expect(both.primary.map((model) => model.id)).toEqual(['whisper-large-v3-turbo'])
		expect(both.multilingual.map((model) => model.id)).toEqual(['whisper-tiny'])
		expect(groupForLanguage(models(tiny), 'he')).toMatchObject({ primary: [], recommendedId: null })
	})
})

describe('supportedModels', () => {
	const all = models(turbo, ivrit, parakeetHe)
	const ids = (version: string) => supportedModels(all, version).map((model) => model.id)

	it('hides a model this app is too old for', () => {
		expect(ids('3.0.21')).toEqual(['whisper-large-v3-turbo', 'whisper-large-v3-turbo-he'])
		expect(ids('3.0.22')).toContain('parakeet-tdt-0.6b-v3-he')
		expect(ids('3.3.2')).toContain('parakeet-tdt-0.6b-v3-he')
		expect(ids('9.9.9-mock')).toContain('parakeet-tdt-0.6b-v3-he')
	})

	it('hides gated models until the app version is known', () => {
		expect(ids('')).toEqual(['whisper-large-v3-turbo', 'whisper-large-v3-turbo-he'])
	})
})

describe('catalogFilename', () => {
	it('names the file after the id, keeping the extension of the download', () => {
		const [first, second] = models(ivrit, parakeetHe)
		expect(catalogFilename(first)).toBe('whisper-large-v3-turbo-he.bin')
		expect(catalogFilename(second)).toBe('parakeet-tdt-0.6b-v3-he.gguf')
	})
})

describe('installedFilename', () => {
	const all = models(turbo, ivrit, norwegian, parakeetHe)
	const [turboModel, ivritModel, , parakeetModel] = all

	it('finds a catalog install by its id, whatever the case of the file on disk', () => {
		expect(installedFilename(all, ivritModel, ['ggml-medium.bin', 'Whisper-Large-V3-Turbo-He.bin'])).toBe('Whisper-Large-V3-Turbo-He.bin')
		expect(installedFilename(all, parakeetModel, ['parakeet-tdt-0.6b-v3-he.gguf'])).toBe('parakeet-tdt-0.6b-v3-he.gguf')
	})

	it('recognises an earlier download under its upstream name only when that name is unambiguous', () => {
		expect(installedFilename(all, turboModel, ['ggml-large-v3-turbo.bin'])).toBe('ggml-large-v3-turbo.bin')
		expect(installedFilename(all, ivritModel, ['ggml-model.bin'])).toBeNull()
	})

	it('reports nothing for a model that is not in the folder', () => {
		expect(installedFilename(all, turboModel, ['ggml-medium.bin'])).toBeNull()
		expect(installedFilename(all, turboModel, [])).toBeNull()
	})
})

describe('catalogNameForFile', () => {
	const all = models(
		turbo,
		entry({ id: 'ivrit', name: 'Whisper Hebrew', url: 'https://example.com/he/ggml-model.bin' }),
		entry({ id: 'nb', name: 'NB-Whisper', url: 'https://example.com/no/ggml-model.bin' }),
		entry({ id: 'parakeet', name: 'Parakeet TDT 0.6B v3', url: 'https://example.com/parakeet-tdt-0.6b-v3-Q4_K_M.gguf?download=true' }),
	)

	it('names a file installed from the catalog, and one downloaded earlier under its upstream name', () => {
		expect(catalogNameForFile(all, 'ivrit.bin')).toBe('Whisper Hebrew')
		expect(catalogNameForFile(all, 'GGML-large-v3-turbo.bin')).toBe('Whisper Large v3 Turbo')
		expect(catalogNameForFile(all, 'parakeet-tdt-0.6b-v3-q4_k_m.gguf')).toBe('Parakeet TDT 0.6B v3')
	})

	it('does not guess between entries that share an upstream filename, or name unknown files', () => {
		expect(catalogNameForFile(all, 'ggml-model.bin')).toBeNull()
		expect(catalogNameForFile(all, 'ggml-medium.bin')).toBeNull()
	})
})

describe('presentation', () => {
	it('describes a model in the UI language, falling back to English, with the direction of the text shown', () => {
		const [model] = models(turbo)
		expect(describeModel(model, 'he-IL')).toEqual({ text: 'הכול-יכול.', dir: 'rtl' })
		expect(describeModel(model, 'fr-FR')).toEqual({ text: 'The all-rounder.', dir: 'ltr' })
		expect(describeModel(models(entry({ description: { 'en-US': 'English only.' } }))[0], 'he-IL')).toEqual({ text: 'English only.', dir: 'ltr' })
	})

	it('formats sizes the way a person reads them', () => {
		expect(formatModelSize(1624555275, 'en-US')).toBe('1.6 GB')
		expect(formatModelSize(77691713, 'en-US')).toBe('78 MB')
		expect(formatModelSize(1000, 'en-US')).toBe('1 MB')
		expect(formatModelSize(77691713, 'not a locale')).toBe('78 MB')
	})
})

describe('classifyInstallError', () => {
	it('recognises a download that did not match the catalog', () => {
		expect(classifyInstallError('Corrupt download: expected sha256 aa, got bb\n\nLocation:\n    src/cmd/download.rs:162')).toBe('verification')
		expect(classifyInstallError(new Error('Incomplete download: expected 10 bytes, the file holds 9'))).toBe('verification')
	})

	it('leaves every other failure to the general error dialog', () => {
		expect(classifyInstallError('error sending request for url (https://huggingface.co/x)')).toBe('other')
		expect(classifyInstallError('No space left on device (os error 28)')).toBe('other')
		expect(classifyInstallError(undefined)).toBe('other')
	})
})
