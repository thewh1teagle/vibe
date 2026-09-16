import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as config from '~/lib/config'

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	listeners: new Map<string, Set<(event: { payload: unknown }) => void>>(),
	remove: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
		const set = mocks.listeners.get(name) ?? new Set()
		set.add(callback)
		mocks.listeners.set(name, set)
		return () => set.delete(callback)
	}),
}))
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('/') }))
vi.mock('@tauri-apps/plugin-fs', () => ({ remove: mocks.remove }))
vi.mock('~/lib/model', () => ({
	getFilenameFromUrl: async (url: string) => new URL(url).pathname.split('/').pop() || '',
}))

import { installNativeModelPackage } from './native-model'

const sensevoice = config.nativeModelDownloads.find((entry) => entry.engine === 'sensevoice')!
const nano = config.nativeModelDownloads.find((entry) => entry.engine === 'funasr-nano')!

function installedPathFor(entry: config.NativeModelDownload) {
	return `/models/${entry.engine}-rev/model.vibe-model`
}

/** Route invoke calls the way the real backend would for a successful download. */
function mockBackend(failCommand?: string) {
	mocks.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
		if (command === 'prepare_model_package_staging') return '/models/.download-test'
		if (command === 'download_model') {
			if (failCommand === 'download_model') throw new Error('network down')
			return { status: 'completed' }
		}
		if (command === 'install_model_package') {
			if (failCommand === 'install_model_package') throw new Error('sha256 mismatch')
			const engine = String(args?.engine)
			const entry = engine === 'sensevoice' ? sensevoice : nano
			return installedPathFor(entry)
		}
		return null
	})
}

function invokedCommands() {
	return mocks.invoke.mock.calls.map((call) => call[0] as string)
}

function invokeArgs(command: string) {
	return mocks.invoke.mock.calls.filter((call) => call[0] === command).map((call) => call[1] as Record<string, unknown>)
}

beforeEach(() => {
	vi.clearAllMocks()
	mocks.listeners.clear()
	mocks.remove.mockClear()
	mockBackend()
})

describe('installNativeModelPackage', () => {
	it('stages, downloads every component, then installs the package', async () => {
		const outcome = await installNativeModelPackage(nano)
		expect(outcome).toEqual({ status: 'installed', path: installedPathFor(nano) })

		// The encoder goes first: it is the smaller half, so a mid-way failure wastes the least.
		const downloads = invokeArgs('download_model')
		expect(downloads.map((args) => args.url)).toEqual([nano.encoder!.url, nano.model.url])
		for (const [index, component] of [nano.encoder!, nano.model].entries()) {
			expect(downloads[index].path).toBe(`/models/.download-test/${component.url.split('/').pop()}`)
			expect(downloads[index].integrity).toEqual({ size: component.size, sha256: component.sha256 })
		}

		expect(invokeArgs('install_model_package')).toEqual([
			{
				staging: '/models/.download-test',
				engine: 'funasr-nano',
				revision: nano.revision,
				model: 'qwen3-0.6b-q4km.gguf',
				encoder: 'funasr-encoder-f16.gguf',
			},
		])
		// A successful install renames the staging folder, so nothing is left to sweep.
		expect(mocks.remove).not.toHaveBeenCalled()
	})

	it('passes a null encoder for sensevoice', async () => {
		const outcome = await installNativeModelPackage(sensevoice)
		expect(outcome).toEqual({ status: 'installed', path: installedPathFor(sensevoice) })
		expect(invokeArgs('download_model')).toHaveLength(1)
		expect(invokeArgs('install_model_package')[0]).toMatchObject({ engine: 'sensevoice', encoder: null })
	})

	it('fails and cleans the staging folder when a component download fails', async () => {
		mockBackend('download_model')
		const outcome = await installNativeModelPackage(sensevoice)
		expect(outcome).toEqual({ status: 'failed', error: expect.stringContaining('network down') })
		expect(invokedCommands()).not.toContain('install_model_package')
		expect(mocks.remove).toHaveBeenCalledWith('/models/.download-test', { recursive: true })
	})

	it('fails and cleans the staging folder when the staged package fails validation', async () => {
		mockBackend('install_model_package')
		const outcome = await installNativeModelPackage(sensevoice)
		expect(outcome).toEqual({ status: 'failed', error: expect.stringContaining('sha256 mismatch') })
		expect(mocks.remove).toHaveBeenCalledWith('/models/.download-test', { recursive: true })
	})

	it('stops without installing and cleans up when a download is cancelled', async () => {
		mocks.invoke.mockImplementation(async (command: string) => {
			if (command === 'prepare_model_package_staging') return '/models/.download-test'
			if (command === 'download_model') return { status: 'cancelled' }
			return null
		})
		const outcome = await installNativeModelPackage(sensevoice)
		expect(outcome).toEqual({ status: 'cancelled' })
		expect(invokedCommands()).not.toContain('install_model_package')
		expect(mocks.remove).toHaveBeenCalledWith('/models/.download-test', { recursive: true })
	})

	it('reports whole-package progress folded from per-component events', async () => {
		const totalBytes = nano.model.size! + nano.encoder!.size!
		// Hold the encoder download open so the progress event lands mid-flight, like a real stream.
		let releaseDownload: (value: { status: string }) => void = () => {}
		let downloads = 0
		mocks.invoke.mockImplementation(async (command: string) => {
			if (command === 'prepare_model_package_staging') return '/models/.download-test'
			if (command === 'download_model') {
				if (++downloads === 1) return new Promise<{ status: string }>((resolve) => (releaseDownload = resolve))
				return { status: 'completed' }
			}
			if (command === 'install_model_package') return installedPathFor(nano)
			return null
		})
		const seen: number[] = []
		const flow = installNativeModelPackage(nano, { onProgress: (percent) => seen.push(percent) })
		await vi.waitFor(() => expect(invokedCommands()).toContain('download_model'))
		for (const callback of mocks.listeners.get('download_progress') ?? []) {
			callback({ payload: [nano.encoder!.size! / 2, nano.encoder!.size!] })
		}
		releaseDownload({ status: 'completed' })
		expect(await flow).toEqual({ status: 'installed', path: installedPathFor(nano) })
		expect(seen[0]).toBeCloseTo((nano.encoder!.size! / 2 / totalBytes) * 100, 5)
		expect(seen[seen.length - 1]).toBe(100)
		// The encoder finished and the decoder restarted from zero without dipping the total below
		// the encoder's share.
		expect(seen[0]).toBeLessThanOrEqual((nano.encoder!.size! / totalBytes) * 100)
	})
})
