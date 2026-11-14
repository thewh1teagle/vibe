import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => path }))
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }))

const { errorCode, fileExt } = await import('./analytics')

describe('fileExt', () => {
	it('reports a known media extension, lowercase', () => {
		expect(fileExt('/tmp/interview.mp3')).toBe('mp3')
		expect(fileExt('/tmp/interview.MP3')).toBe('mp3')
		expect(fileExt('C:\\Users\\me\\call 17.8.2026.MOV')).toBe('mov')
		expect(fileExt('relative.name.m4a')).toBe('m4a')
	})

	it('never returns part of the path', () => {
		expect(fileExt('/Users/john.doe/rec')).toBe('none')
		expect(fileExt('C:\\Users\\john.doe\\rec')).toBe('none')
		expect(fileExt('/Users/john/recording')).toBe('none')
		expect(fileExt('recording')).toBe('none')
		expect(fileExt('/Users/john/.hidden')).toBe('none')
		expect(fileExt('/Users/john/trailing.')).toBe('none')
		expect(fileExt('')).toBe('none')
	})

	it('reports anything off the media list as other', () => {
		expect(fileExt('/tmp/notes.pdf')).toBe('other')
		expect(fileExt('/tmp/name.john-doe')).toBe('other')
		expect(fileExt('/tmp/x.verylongextension')).toBe('other')
		expect(fileExt('/tmp/x.mp3 copy')).toBe('other')
	})
})

describe('errorCode', () => {
	it('keeps a plain backend code', () => {
		expect(errorCode({ code: 'invalid_audio', message: 'Audio file not found: /Users/a b/x.wav' })).toBe('invalid_audio')
	})

	it('falls back to unknown', () => {
		expect(errorCode(new Error('boom'))).toBe('unknown')
		expect(errorCode('Audio file not found: /Users/a/x.wav')).toBe('unknown')
		expect(errorCode({ code: '/Users/a/x.wav' })).toBe('unknown')
		expect(errorCode({ code: 3 })).toBe('unknown')
		expect(errorCode(null)).toBe('unknown')
	})
})
