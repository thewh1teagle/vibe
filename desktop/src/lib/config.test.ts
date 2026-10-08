import { describe, expect, it } from 'vitest'
import { findNativeModelDownload, nativeModelDownloads } from './config'

const sensevoice = nativeModelDownloads.find((entry) => entry.engine === 'sensevoice')!
const nano = nativeModelDownloads.find((entry) => entry.engine === 'funasr-nano')!

describe('nativeModelDownloads', () => {
	it('covers both engines exactly once', () => {
		const engines = nativeModelDownloads.map((entry) => entry.engine).sort()
		expect(engines).toEqual(['funasr-nano', 'sensevoice'])
	})

	it('pins an exact size and sha256 on every component', () => {
		// The install re-validates through the package manifest: a missing or malformed
		// integrity value would reject a perfectly good download.
		for (const entry of nativeModelDownloads) {
			for (const component of [entry.model, entry.encoder]) {
				if (!component) continue
				expect(component.size, `${entry.engine} size`).toBeGreaterThan(0)
				expect(component.sha256, `${entry.engine} sha256`).toMatch(/^[0-9a-f]{64}$/)
			}
		}
	})

	it('gives the nano package an encoder and the sensevoice package none', () => {
		const nano = nativeModelDownloads.find((entry) => entry.engine === 'funasr-nano')
		const sensevoice = nativeModelDownloads.find((entry) => entry.engine === 'sensevoice')
		expect(nano?.encoder).toBeDefined()
		expect(sensevoice?.encoder).toBeUndefined()
	})

	it('downloads to plain filenames the install can reuse', () => {
		for (const entry of nativeModelDownloads) {
			for (const component of [entry.model, entry.encoder]) {
				if (!component) continue
				const filename = new URL(component.url).pathname.split('/').pop()
				expect(filename).toMatch(/^[\w.-]+\.gguf$/)
			}
		}
	})
})

describe('findNativeModelDownload', () => {
	it('matches the URL a magic-install link hands the setup page by the model component', () => {
		// The deep-link handlers strip the vibe:// wrapper, so the matcher only ever sees the
		// bare component URL the link carried.
		expect(findNativeModelDownload(nano.model.url)?.engine).toBe('funasr-nano')
	})

	it('matches the encoder component to the same package', () => {
		expect(findNativeModelDownload(nano.encoder!.url)?.engine).toBe('funasr-nano')
	})

	it('ignores query strings the download page appends', () => {
		expect(findNativeModelDownload(`${sensevoice.model.url}?download=true`)?.engine).toBe('sensevoice')
	})

	it('returns null for URLs outside the catalog', () => {
		expect(findNativeModelDownload('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true')).toBeNull()
		expect(findNativeModelDownload('not a url')).toBeNull()
	})
})
