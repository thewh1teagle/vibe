// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateBanner from '~/components/update-banner'
import UpdateProgress from '~/components/updater-progress'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig } from '~/lib/config-store'
import { initialUpdateState, type UpdateState } from '~/lib/updater'
import { m } from '~/paraglide/messages.js'
import { UpdaterContext, UpdaterProvider } from './updater'

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	listeners: new Map<string, (event: { payload: unknown }) => void>(),
	toast: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
		mocks.listeners.set(name, callback)
		return () => mocks.listeners.delete(name)
	}),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }))

const idle: UpdateState = { ...initialUpdateState, currentVersion: '3.3.6' }

function respond(overrides: Record<string, unknown> = {}) {
	const answers: Record<string, unknown> = { update_state: idle, update_check_now: idle, update_take_notice: null, update_remind_later: idle, ...overrides }
	mocks.invoke.mockImplementation(async (cmd: string) => answers[cmd])
}

let context: React.ContextType<typeof UpdaterContext>
function Probe() {
	context = useContext(UpdaterContext)
	return <span data-testid="available">{String(context.availableUpdate)}</span>
}

function mount() {
	render(
		<UpdaterProvider>
			<Probe />
			<UpdateBanner />
			<UpdateProgress />
		</UpdaterProvider>,
	)
}

function emit(state: UpdateState) {
	act(() => mocks.listeners.get('update-state')?.({ payload: state }))
}

beforeEach(() => {
	mocks.invoke.mockReset()
	mocks.listeners.clear()
	mocks.toast.mockReset()
	respond()
})
afterEach(() => cleanup())

describe('UpdaterProvider', () => {
	it('follows update-state events into availableUpdate', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		expect(screen.getByTestId('available').textContent).toBe('false')
		emit({ ...idle, phase: 'ready', version: '3.4.0' })
		expect(screen.getByTestId('available').textContent).toBe('true')
		emit({ ...idle, phase: 'installing', version: '3.4.0' })
		expect(screen.getByTestId('available').textContent).toBe('false')
	})

	it('keeps a background download out of sight and shows one the user asked for', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		emit({ ...idle, phase: 'downloading', version: '3.4.0', percent: 30 })
		expect(screen.queryByText(m.updatingModalTitle())).toBeNull()
		emit({ ...idle, phase: 'downloading', version: '3.4.0', percent: 30, interactive: true })
		expect(screen.getByText(m.updatingModalTitle())).toBeTruthy()
	})

	it('shows phase installing as a non-dismissable "Updating to" dialog', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		emit({ ...idle, phase: 'installing', version: '3.4.0', interactive: true })
		const dialog = screen.getByRole('dialog')
		expect(screen.getByText(m.updatingTo({ version: '3.4.0' }))).toBeTruthy()
		expect(screen.queryByText(m.updatingModalBody({ version: '3.4.0' }))).toBeNull()
		fireEvent.keyDown(dialog, { key: 'Escape' })
		expect(screen.getByRole('dialog')).toBeTruthy()
	})

	it('shows the reminder banner only while Rust says to remind', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		emit({ ...idle, phase: 'ready', version: '3.4.0' })
		expect(screen.queryByRole('status')).toBeNull()
		emit({ ...idle, phase: 'ready', version: '3.4.0', remind: true })
		expect(screen.getByRole('status')).toBeTruthy()
	})

	it('offers a restart for a downloaded update and installs without asking', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		emit({ ...idle, phase: 'ready', version: '3.4.0', remind: true })
		expect(screen.getByText(m.updateReadyBanner({ version: '3.4.0' }))).toBeTruthy()
		await act(async () => fireEvent.click(screen.getByRole('button', { name: m.restartToUpdate() })))
		expect(mocks.invoke).toHaveBeenCalledWith('update_install_now')
	})

	it('offers an update for a known version and snoozes on Later', async () => {
		mount()
		await waitFor(() => expect(mocks.listeners.has('update-state')).toBe(true))
		emit({ ...idle, phase: 'available', version: '3.4.0', remind: true })
		expect(screen.getByText(m.updateAvailableBanner({ version: '3.4.0' }))).toBeTruthy()
		expect(screen.getByRole('button', { name: m.updateVersion() })).toBeTruthy()
		await act(async () => fireEvent.click(screen.getByRole('button', { name: m.cancelUpdate() })))
		expect(mocks.invoke).toHaveBeenCalledWith('update_remind_later')
		expect(screen.queryByRole('status')).toBeNull()
	})

	it('saves a changed setting before asking Rust to check again', async () => {
		mount()
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('update_state'))
		await act(() => context.setAutoUpdate(false))
		expect(readConfig(CONFIG_KEYS.autoUpdate, true)).toBe(false)
		expect(mocks.invoke).toHaveBeenCalledWith('update_check_now')
		mocks.invoke.mockClear()
		await act(() => context.setChannel('beta'))
		expect(readConfig(CONFIG_KEYS.updateChannel, 'stable')).toBe('beta')
		expect(mocks.invoke).toHaveBeenCalledWith('update_check_now')
	})

	it('announces a background update once', async () => {
		respond({ update_take_notice: { from: '3.3.5', to: '3.3.6' } })
		mount()
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
		expect(mocks.toast.mock.calls[0][0]).toBe(m.updatedTo({ version: '3.3.6' }))
	})
})
