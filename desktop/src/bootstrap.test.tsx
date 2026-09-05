// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
	windowLabel: 'main',
	loadConfigStore: vi.fn(),
	runMigrations: vi.fn(),
	unregisterAll: vi.fn(),
	render: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: mocks.windowLabel }) }))
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({ unregisterAll: mocks.unregisterAll }))
vi.mock('./lib/config-store', () => ({ loadConfigStore: mocks.loadConfigStore }))
vi.mock('./lib/migrations', () => ({ runMigrations: mocks.runMigrations }))
vi.mock('./root', () => ({ default: () => null }))
vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: mocks.render }) } }))

beforeEach(() => {
	vi.resetModules()
	vi.resetAllMocks()
	mocks.windowLabel = 'main'
	document.body.innerHTML = '<div id="root"></div>'
})

afterEach(() => vi.restoreAllMocks())

describe('shortcut recovery after a webview reload', () => {
	it('finishes clearing stale native shortcuts before either provider can register again', async () => {
		let finishCleanup!: () => void
		mocks.unregisterAll.mockImplementation(() => new Promise<void>((resolve) => (finishCleanup = resolve)))
		await import('./bootstrap')
		await waitFor(() => expect(mocks.unregisterAll).toHaveBeenCalledOnce())
		expect(mocks.render).not.toHaveBeenCalled()
		finishCleanup()
		await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce())
	})

	it.each(['dictation-indicator', 'meeting-prompt'])('does not release live shortcuts when %s opens', async (label) => {
		mocks.windowLabel = label
		await import('./bootstrap')
		await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce())
		expect(mocks.unregisterAll).not.toHaveBeenCalled()
	})

	it('keeps Settings accessible if native cleanup fails', async () => {
		const error = new Error('Native cleanup failed')
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.unregisterAll.mockRejectedValue(error)
		await import('./bootstrap')
		await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce())
		expect(log).toHaveBeenCalledWith('Failed to clear shortcuts from the previous webview:', error)
	})

	it('grants the native cleanup command used during startup', () => {
		const capabilities = JSON.parse(readFileSync(join(__dirname, '../src-tauri/capabilities/main.json'), 'utf8'))
		expect(capabilities.permissions).toContain('global-shortcut:allow-unregister-all')
	})
})
