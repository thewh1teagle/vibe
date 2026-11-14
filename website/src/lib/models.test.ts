import { describe as suite, expect, it } from 'vitest'
import catalog from 'virtual:model-catalog'
import { ANY_LANGUAGE, deepLink, defaultLanguage, describe, languageFromParam, models, modelsFor, needsNewerApp, tags } from './models'

const required = ['id', 'name', 'languages', 'tags', 'publisher', 'license', 'url', 'size', 'sha256', 'description']
const allowed = [...required, 'minAppVersion', 'mirrors']

suite('models.json', () => {
	const entries = catalog.models

	it('has models, each with a unique id', () => {
		expect(entries.length).toBeGreaterThan(0)
		const ids = entries.map((model) => model.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it.each(models.map((model) => [model.id, model] as const))('%s matches the schema', (id, model) => {
		const keys = Object.keys(model)
		for (const key of required) expect(keys, `missing ${key}`).toContain(key)
		for (const key of keys) expect(allowed, `unknown field ${key}`).toContain(key)

		expect(id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
		expect(model.name.trim()).not.toBe('')
		expect(model.license.trim()).not.toBe('')

		expect(model.languages.length).toBeGreaterThan(0)
		if (model.languages.includes('*')) expect(model.languages).toEqual(['*'])
		else for (const code of model.languages) expect(code).toMatch(/^[a-z]{2}$/)
		expect(new Set(model.languages).size).toBe(model.languages.length)

		for (const tag of model.tags) expect(tags).toContain(tag)
		expect(new Set(model.tags).size).toBe(model.tags.length)

		expect(model.publisher.name.trim()).not.toBe('')
		expect(model.publisher.url).toMatch(/^https:\/\//)

		const url = new URL(model.url)
		expect(url.protocol).toBe('https:')
		expect(url.search).toBe('')
		expect(url.hash).toBe('')
		expect(url.pathname.split('/').at(-1)).toMatch(/\.(bin|gguf)$/)
		expect(model.url).not.toContain('/blob/')
		for (const mirror of model.mirrors ?? []) {
			expect(new URL(mirror).protocol).toBe('https:')
			expect(mirror).not.toBe(model.url)
		}

		expect(Number.isInteger(model.size) && model.size > 0).toBe(true)
		expect(model.sha256).toMatch(/^[0-9a-f]{64}$/)
		if (model.minAppVersion !== undefined) expect(model.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/)

		expect(model.description['en-US']?.trim()).toBeTruthy()
		for (const [locale, text] of Object.entries(model.description)) {
			expect(locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
			expect(text.trim()).not.toBe('')
		}
	})

	it('pins at most one recommended model per language', () => {
		const seen = new Map<string, string>()
		for (const model of models.filter((entry) => entry.tags.includes('recommended'))) {
			for (const code of model.languages) {
				expect(seen.get(code), `${code} is recommended twice`).toBeUndefined()
				seen.set(code, model.id)
			}
		}
	})
})

suite('deep link', () => {
	const prefix = 'vibe://download/?url='

	it.each(models.map((model) => [model.id, model.url] as const))('%s survives both of the app parsers', (_id, url) => {
		const link = deepLink(url)
		// macOS and startup arguments: everything after the prefix, taken verbatim.
		expect(link.startsWith(prefix)).toBe(true)
		expect(link.replace(prefix, '')).toBe(url)
		// Windows and Linux: parsed as a query string.
		expect(new URLSearchParams(link.replace('vibe://download/?', '')).get('url')).toBe(url)
	})
})

suite('grouping', () => {
	const ids = (list: { id: string }[]) => list.map((model) => model.id)

	it("leads with the language's own recommendation (Hebrew)", () => {
		const { top, first, rest, divider } = modelsFor('he')
		expect(top?.id).toBe('whisper-large-v3-turbo-he')
		expect(first[0]).toBe(top)
		expect(first.every((model) => model.languages.includes('he'))).toBe(true)
		expect(ids(rest)).toEqual(['whisper-large-v3-turbo', 'whisper-tiny'])
		expect(divider).toBe('every')
	})

	it('leads with the multilingual recommendation when the language has none of its own (English)', () => {
		const { top, first, rest, divider } = modelsFor('en')
		expect(top?.id).toBe('whisper-large-v3-turbo')
		expect(ids(first)).toEqual(['whisper-large-v3-turbo', 'parakeet-tdt-0.6b-v3', 'nemotron-3.5-asr-streaming-0.6b'])
		expect(ids(rest)).toEqual(['whisper-tiny'])
		expect(divider).toBe('every')
	})

	it('shows the multilingual models first for any language, then the language-limited ones', () => {
		const { top, first, rest, divider } = modelsFor(ANY_LANGUAGE)
		expect(top?.id).toBe('whisper-large-v3-turbo')
		expect(first[0]).toBe(top)
		expect(first.every((model) => model.languages.includes('*'))).toBe(true)
		expect(rest.length).toBeGreaterThan(0)
		expect(rest.every((model) => !model.languages.includes('*'))).toBe(true)
		expect(divider).toBe('specific')
	})

	it('never shows a model twice', () => {
		for (const language of ['he', 'en', 'sv', ANY_LANGUAGE]) {
			const { first, rest } = modelsFor(language)
			const shown = ids([...first, ...rest])
			expect(new Set(shown).size).toBe(shown.length)
		}
	})

	it('starts from the site language when the catalog has it', () => {
		expect(defaultLanguage('he-IL')).toBe('he')
		expect(defaultLanguage('xx-XX')).toBe(ANY_LANGUAGE)
		expect(languageFromParam('HE')).toBe('he')
		expect(languageFromParam('xx')).toBeNull()
		expect(languageFromParam(null)).toBeNull()
	})

	it('describes in English when the locale has no text', () => {
		expect(describe(models[0], 'xx-XX')).toEqual({ text: models[0].description['en-US'], locale: 'en-US' })
	})

	it('flags a model only when the latest release cannot run it', () => {
		const model = { ...models[0], minAppVersion: '3.3.3' }
		expect(needsNewerApp(model, '3.3.2')).toBe(true)
		expect(needsNewerApp(model, '3.3.3')).toBe(false)
		expect(needsNewerApp(model, '3.10.0')).toBe(false)
		expect(needsNewerApp({ ...models[0], minAppVersion: undefined }, '1.0.0')).toBe(false)
	})
})
