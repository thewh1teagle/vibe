import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTO_EXPORT, exportTranscript, sharedFolder, summarizeResults, type ExportIo, type ExportInput, type ExportRendering } from './auto-export'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/path', () => ({ join: vi.fn(), dirname: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: vi.fn(), mkdir: vi.fn(), writeTextFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('~/lib/docx', () => ({ toDocx: vi.fn() }))
vi.mock('~/lib/pdf/transcript-pdf', () => ({ transcriptToPdf: vi.fn() }))
vi.mock('~/lib/transcripts-store', () => ({ transcriptsFolder: vi.fn() }))

const input: ExportInput = {
	name: 'interview-02',
	path: '/rec/interview-02.mp4',
	segments: [{ start: 0, stop: 120, text: 'Hello there', speaker: 0 }],
}
const rendering: ExportRendering = {
	direction: 'ltr',
	theme: 'light',
	showTimestamps: true,
	showSpeakers: true,
	speakerLabel: 'Speaker',
	labels: { transcript: 'Transcript', summary: 'Summary' },
}
const messages = { skipped: (names: string) => `already had ${names}`, fallback: 'source folder is read-only' }

/** A fake disk: a set of existing paths, a log of writes, and one folder that refuses writes. */
function fakeIo(existing: string[] = [], readOnly: string | null = null) {
	const writes: string[] = []
	const io: ExportIo = {
		besidePath: async (source, suffix) => source.replace(/\.[^.]+$/, '') + suffix,
		projectsFolder: async () => '/projects',
		join: async (...parts) => parts.join('/'),
		dirname: async (path) => path.slice(0, path.lastIndexOf('/')),
		exists: async (path) => existing.includes(path),
		mkdir: async () => {},
		writeText: async (path) => {
			if (readOnly && path.startsWith(readOnly)) throw new Error('EACCES: permission denied')
			writes.push(path)
		},
		writeBytes: async (path) => {
			writes.push(path)
		},
	}
	return { io, writes }
}

describe('exportTranscript', () => {
	it('writes every format beside the recording', async () => {
		const { io, writes } = fakeIo()
		const result = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt', 'srt'] }, rendering, io, messages)
		expect(result.status).toBe('exported')
		expect(writes).toEqual(['/rec/interview-02.vtt', '/rec/interview-02.srt'])
		expect(result.folder).toBe('/rec')
	})

	it('keeps an existing file and says so, unless replace is on', async () => {
		const { io, writes } = fakeIo(['/rec/interview-02.vtt'])
		const kept = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt'] }, rendering, io, messages)
		expect(kept.status).toBe('skipped')
		expect(kept.detail).toBe('already had interview-02.vtt')
		expect(writes).toEqual([])

		const replaced = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt'], replace: true }, rendering, io, messages)
		expect(replaced.status).toBe('exported')
		expect(writes).toEqual(['/rec/interview-02.vtt'])
	})

	it('is exported, not skipped, when only some formats already exist', async () => {
		const { io, writes } = fakeIo(['/rec/interview-02.vtt'])
		const result = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt', 'srt'] }, rendering, io, messages)
		expect(result.status).toBe('exported')
		expect(result.formats).toEqual(['srt'])
		expect(result.detail).toBe('already had interview-02.vtt')
		expect(writes).toEqual(['/rec/interview-02.srt'])
	})

	it('falls back to the projects folder when the recording folder is read-only', async () => {
		const { io, writes } = fakeIo([], '/rec')
		const result = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt'] }, rendering, io, messages)
		expect(result.status).toBe('fallback')
		expect(result.detail).toBe('source folder is read-only')
		expect(writes).toEqual(['/projects/interview-02.vtt'])
	})

	it('writes to the chosen folder with the project name', async () => {
		const { io, writes } = fakeIo()
		const result = await exportTranscript(
			input,
			{ ...DEFAULT_AUTO_EXPORT, formats: ['srt'], destination: 'folder', folder: '/out' },
			rendering,
			io,
			messages,
		)
		expect(result.status).toBe('exported')
		expect(writes).toEqual(['/out/interview-02.srt'])
	})

	it('reports a failure instead of throwing', async () => {
		const { io } = fakeIo()
		io.writeText = async () => {
			throw new Error('disk full')
		}
		const result = await exportTranscript(input, { ...DEFAULT_AUTO_EXPORT, formats: ['vtt'] }, rendering, io, messages)
		expect(result.status).toBe('failed')
		expect(result.detail).toContain('disk full')
	})
})

describe('summaries', () => {
	it('counts by outcome and finds the one shared folder', () => {
		const results = [
			{ status: 'exported' as const, paths: ['/rec/a.vtt'], formats: ['vtt' as const], folder: '/rec' },
			{ status: 'skipped' as const, paths: [], formats: [], folder: '/rec' },
			{ status: 'fallback' as const, paths: ['/projects/c.vtt'], formats: ['vtt' as const], folder: '/projects' },
		]
		expect(summarizeResults(results)).toEqual({ exported: 1, skipped: 1, fallback: 1, failed: 0 })
		expect(sharedFolder(results)).toBeNull()
		expect(sharedFolder(results.slice(0, 2))).toBe('/rec')
	})
})
