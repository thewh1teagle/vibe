import { describe, expect, it } from 'vitest'
import bundled from '../../../website/public/models.json'
import { normalizeCatalog } from './model-catalog'
import { classifyDownloadUrl, extractDownloadUrl, isDownloadLink, parseDownloadLink } from './model-deep-link'

const models = normalizeCatalog(bundled)!.models
const parse = (link: string) => parseDownloadLink(link, models)
const IVRIT = 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin?download=true'

describe('download deep links', () => {
	it('installs the ivrit.ai link as the catalog Hebrew model', () => {
		const result = parse(`vibe://download/?url=${IVRIT}`)
		expect(result.kind).toBe('catalog')
		if (result.kind === 'catalog') expect(result.model.id).toBe('whisper-large-v3-turbo-he')
	})

	it('reads the address the same way whether it arrives raw or percent-encoded', () => {
		expect(extractDownloadUrl(`vibe://download/?url=${IVRIT}`)).toBe(IVRIT)
		expect(extractDownloadUrl(`vibe://download/?url=${encodeURIComponent(IVRIT)}`)).toBe(IVRIT)
		expect(extractDownloadUrl(`vibe://download?foo=1&url=${IVRIT}`)).toBe(IVRIT)
		expect(extractDownloadUrl('vibe://download/?nothing=here')).toBeNull()
		expect(isDownloadLink('/Users/me/audio.mp3')).toBe(false)
	})

	it('treats a mirror as its catalog model', () => {
		const result = parse('vibe://download/?url=https://github.com/thewh1teagle/vibe/releases/download/model-files-v1.0/ggml-large-v3-turbo.bin')
		expect(result.kind === 'catalog' && result.model.id).toBe('whisper-large-v3-turbo')
	})

	it('ignores the query string and fragment but not the path', () => {
		expect(parse('vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin#x').kind).toBe('catalog')
		expect(parse('vibe://download/?url=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin/x').kind).toBe('unverified')
	})

	it('allows a non-catalog Hugging Face or GitHub file only as unverified, with the full address', () => {
		const url = 'https://huggingface.co/someone/custom/resolve/main/ggml-model.bin?download=true'
		expect(parse(`vibe://download/?url=${url}`)).toEqual({ kind: 'unverified', url })
		expect(parse('vibe://download/?url=https://github.com/a/b/releases/download/v1/m.bin').kind).toBe('unverified')
	})

	it('refuses plain http, even for a catalog address', () => {
		expect(parse(`vibe://download/?url=${IVRIT.replace('https:', 'http:')}`)).toMatchObject({ kind: 'refused', reason: 'insecure' })
		expect(parse('vibe://download/?url=file:///etc/passwd')).toMatchObject({ kind: 'refused', reason: 'insecure' })
	})

	it('refuses lookalike hosts, credentials and ports', () => {
		for (const url of [
			'https://huggingface.co.evil.com/a/b/resolve/main/ggml-model.bin',
			'https://evil.com/huggingface.co/a/b/resolve/main/ggml-model.bin',
			'https://user@huggingface.co/a/b/resolve/main/ggml-model.bin',
			'https://huggingface.co@evil.com/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin',
			'https://huggingface.co:8443/a/b/resolve/main/ggml-model.bin',
			'https://cdn.huggingface.co/a/b/resolve/main/ggml-model.bin',
			'https://huggingface.co./a/b/resolve/main/ggml-model.bin',
		]) {
			expect(parse(`vibe://download/?url=${url}`), url).toMatchObject({ kind: 'refused', reason: 'host' })
		}
	})

	it('refuses garbage', () => {
		for (const link of ['vibe://download/?url=', 'vibe://download/?url=not a url', 'vibe://download/?url=%E0%A4%A', 'vibe://download/?url=https%3A%2F%2F%E0%A4%A']) {
			expect(parse(link).kind, link).toBe('refused')
		}
		expect(classifyDownloadUrl(null, models)).toMatchObject({ kind: 'refused', reason: 'invalid' })
	})

	it('accepts every catalog address the website links to', () => {
		for (const model of models) {
			const result = parse(`vibe://download/?url=${model.url}`)
			expect(result.kind === 'catalog' && result.model.id, model.id).toBe(model.id)
		}
	})
})
