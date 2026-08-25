import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => ({
	files: new Map<string, string | Uint8Array>(),
	directories: new Set<string>(),
	failCopies: false,
	failWrites: 0,
}))

vi.mock('@tauri-apps/api/path', async () => {
	const path = await import('node:path')
	return {
		documentDir: async () => '/documents',
		join: async (...parts: string[]) => path.posix.join(...parts),
		dirname: async (value: string) => path.posix.dirname(value),
		basename: async (value: string) => path.posix.basename(value),
	}
})

vi.mock('@tauri-apps/plugin-fs', () => ({
	exists: async (path: string) => disk.files.has(path) || disk.directories.has(path),
	mkdir: async (path: string, options?: { recursive?: boolean }) => {
		if (disk.directories.has(path) && !options?.recursive) throw new Error(`exists: ${path}`)
		disk.directories.add(path)
	},
	writeTextFile: async (path: string, value: string) => {
		if (disk.failWrites > 0) {
			disk.failWrites -= 1
			throw new Error('disk full')
		}
		disk.files.set(path, value)
	},
	readTextFile: async (path: string) => {
		const value = disk.files.get(path)
		if (typeof value !== 'string') throw new Error(`not text: ${path}`)
		return value
	},
	copyFile: async (source: string, target: string) => {
		if (disk.failCopies) throw new Error('copy failed')
		const value = disk.files.get(source)
		if (value === undefined) throw new Error(`missing: ${source}`)
		disk.files.set(target, value)
	},
	rename: async (source: string, target: string) => {
		if (disk.directories.has(source)) {
			if (disk.directories.has(target)) throw new Error(`exists: ${target}`)
			disk.directories.delete(source)
			disk.directories.add(target)
			for (const directory of [...disk.directories]) {
				if (!directory.startsWith(`${source}/`)) continue
				disk.directories.delete(directory)
				disk.directories.add(`${target}${directory.slice(source.length)}`)
			}
			for (const [path, value] of [...disk.files]) {
				if (!path.startsWith(`${source}/`)) continue
				disk.files.delete(path)
				disk.files.set(`${target}${path.slice(source.length)}`, value)
			}
			return
		}
		const value = disk.files.get(source)
		if (value === undefined) throw new Error(`missing: ${source}`)
		disk.files.set(target, value)
		disk.files.delete(source)
	},
	remove: async (path: string, options?: { recursive?: boolean }) => {
		disk.files.delete(path)
		if (options?.recursive) {
			for (const file of [...disk.files.keys()]) if (file.startsWith(`${path}/`)) disk.files.delete(file)
			for (const directory of [...disk.directories]) if (directory === path || directory.startsWith(`${path}/`)) disk.directories.delete(directory)
		}
	},
	readDir: async () => [],
}))

import { readTranscript, renameTranscript, resolveProjectAudio, saveTranscript } from './transcripts-store'

const createdAt = new Date(2026, 7, 26, 10, 20, 30)
const segments = [{ start: 0, stop: 100, text: 'Hello' }]

beforeEach(() => {
	disk.files.clear()
	disk.directories.clear()
	disk.failCopies = false
	disk.failWrites = 0
})

describe('project media ownership', () => {
	it('persists an untranscribed recording as a playable empty project', async () => {
		disk.files.set('/temp/meeting.wav', new Uint8Array([1, 2, 3]))

		const saved = await saveTranscript({
			name: 'Record-meeting',
			sourcePath: '/temp/meeting.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments: [],
		})

		const record = await readTranscript(saved!.recordPath)
		expect(record?.segments).toEqual([])
		expect(record?.sourcePath).toBe(saved?.mediaPath)
		expect(disk.files.has(saved!.mediaPath)).toBe(true)
		expect(disk.files.has('/temp/meeting.wav')).toBe(false)
	})

	it('moves Vibe-created media into the selected projects folder', async () => {
		disk.files.set('/temp/capture.wav', new Uint8Array([1, 2, 3]))

		const recordPath = await saveTranscript({
			name: 'Record-capture',
			sourcePath: '/temp/capture.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments,
		})

		expect(recordPath?.recordPath).toBe('/media/projects/Record-capture-20260826-102030/transcript.vibe.json')
		expect(recordPath?.mediaPath).toBe('/media/projects/Record-capture-20260826-102030/audio.wav')
		expect(disk.files.has('/temp/capture.wav')).toBe(false)
		const record = await readTranscript(recordPath!.recordPath)
		const audioPath = record && (await resolveProjectAudio(recordPath!.recordPath, record))
		expect(audioPath).toBe('/media/projects/Record-capture-20260826-102030/audio.wav')
		expect(record?.sourcePath).toBe(audioPath)
	})

	it('copies imported media and leaves the user-owned source untouched', async () => {
		disk.files.set('/user/interview.m4a', new Uint8Array([4, 5, 6]))

		const recordPath = await saveTranscript({
			name: 'File-interview',
			sourcePath: '/user/interview.m4a',
			projectsPath: '/media/projects',
			createdAt,
			segments,
		})

		expect(disk.files.has('/user/interview.m4a')).toBe(true)
		const record = await readTranscript(recordPath!.recordPath)
		expect(record?.sourcePath).toBe('/user/interview.m4a')
		expect(await resolveProjectAudio(recordPath!.recordPath, record!)).toBe('/media/projects/File-interview-20260826-102030/audio.m4a')
	})

	it('keeps staged media and removes the incomplete project when its copy fails', async () => {
		disk.files.set('/temp/capture.wav', new Uint8Array([1]))
		disk.failCopies = true

		const saved = await saveTranscript({
			name: 'Record-capture',
			sourcePath: '/temp/capture.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments,
		})

		expect(saved).toBeNull()
		expect(disk.files.has('/temp/capture.wav')).toBe(true)
		expect(disk.directories.has('/media/projects/Record-capture-20260826-102030')).toBe(false)
	})

	it('keeps staged media when final metadata cannot be written', async () => {
		disk.files.set('/temp/capture.wav', new Uint8Array([1]))
		disk.failWrites = 1

		const saved = await saveTranscript({
			name: 'Record-capture',
			sourcePath: '/temp/capture.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments,
		})

		expect(saved).toBeNull()
		expect(disk.files.has('/temp/capture.wav')).toBe(true)
	})

	it('saves imported metadata against the external source when copying fails', async () => {
		disk.files.set('/user/interview.m4a', new Uint8Array([1]))
		disk.failCopies = true

		const saved = await saveTranscript({
			name: 'File-interview',
			sourcePath: '/user/interview.m4a',
			projectsPath: '/media/projects',
			createdAt,
			segments,
		})

		expect(saved?.mediaPath).toBe('/user/interview.m4a')
		expect((await readTranscript(saved!.recordPath))?.sourcePath).toBe('/user/interview.m4a')
	})

	it('atomically reserves distinct folders for concurrent same-second saves', async () => {
		disk.files.set('/user/one.wav', new Uint8Array([1]))
		disk.files.set('/user/two.wav', new Uint8Array([2]))
		const input = { name: 'Meeting', projectsPath: '/media/projects', createdAt, segments }

		const [first, second] = await Promise.all([
			saveTranscript({ ...input, sourcePath: '/user/one.wav' }),
			saveTranscript({ ...input, sourcePath: '/user/two.wav' }),
		])

		expect(first?.recordPath).not.toBe(second?.recordPath)
		expect(new Set([first?.recordPath, second?.recordPath])).toEqual(
			new Set(['/media/projects/Meeting-20260826-102030/transcript.vibe.json', '/media/projects/Meeting-2-20260826-102030/transcript.vibe.json']),
		)
	})

	it('renames project media paths and avoids an occupied target', async () => {
		disk.files.set('/temp/capture.wav', new Uint8Array([1]))
		const saved = await saveTranscript({
			name: 'Original',
			sourcePath: '/temp/capture.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments,
		})
		disk.directories.add('/media/projects/Renamed-20260826-102030')

		const renamed = await renameTranscript(saved!.recordPath, 'Renamed')
		const record = await readTranscript(renamed!.path)

		expect(renamed?.path).toBe('/media/projects/Renamed-2-20260826-102030/transcript.vibe.json')
		expect(record?.sourcePath).toBe('/media/projects/Renamed-2-20260826-102030/audio.wav')
		expect(renamed?.mediaPath).toBe(record?.sourcePath)
	})

	it('rolls the project folder back when renamed metadata cannot be written', async () => {
		disk.files.set('/temp/capture.wav', new Uint8Array([1]))
		const saved = await saveTranscript({
			name: 'Original',
			sourcePath: '/temp/capture.wav',
			projectsPath: '/media/projects',
			moveSourceMedia: true,
			createdAt,
			segments,
		})
		disk.failWrites = 1

		expect(await renameTranscript(saved!.recordPath, 'Broken')).toBeNull()
		expect(await readTranscript(saved!.recordPath)).not.toBeNull()
		expect(disk.directories.has('/media/projects/Broken-20260826-102030')).toBe(false)
	})
})
