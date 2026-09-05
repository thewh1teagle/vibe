// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '~/components/ui/tooltip'
import { m } from '~/paraglide/messages.js'
import { PhoneSection } from './phone'

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	listeners: new Map<string, (event: { payload: unknown }) => void>(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
		mocks.listeners.set(name, callback)
		return () => mocks.listeners.delete(name)
	}),
}))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const firstPhone = { id: 'phone-1', name: 'iPhone', pairedAt: '2026-09-05T10:00:00Z' }
const secondPhone = { id: 'phone-2', name: 'Pixel', pairedAt: '2026-09-05T11:00:00Z' }
const status = (id = 'current-code', devices = [firstPhone], enabled = true) => ({
	enabled,
	pairingId: enabled ? id : null,
	pairingUrl: enabled ? `https://example.test/#${id}` : null,
	endpointId: enabled ? 'test' : null,
	devices,
})

beforeEach(() => {
	mocks.invoke.mockReset()
	mocks.listeners.clear()
	mocks.invoke.mockResolvedValue(status())
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

function openSettings(pairing = false) {
	const onNavigate = vi.fn()
	function Settings() {
		const [open, setOpen] = useState(pairing)
		return (
			<PhoneSection
				pairingOpen={open}
				onPairingChange={(next) => {
					onNavigate(next)
					setOpen(next)
				}}
			/>
		)
	}
	render(
		<TooltipProvider>
			<Settings />
		</TooltipProvider>,
	)
	return onNavigate
}

function confirmPairing(pairingId: string, device = secondPhone) {
	act(() => mocks.listeners.get('handoff_paired')?.({ payload: { pairingId, device } }))
}

describe('saved phone connections', () => {
	it('shows saved phones while phone recordings are off', async () => {
		mocks.invoke.mockResolvedValue(status('current-code', [firstPhone, secondPhone], false))
		openSettings()
		expect(await screen.findByText(firstPhone.name)).toBeTruthy()
		expect(screen.getByText(secondPhone.name)).toBeTruthy()
		expect(screen.queryByRole('button', { name: m.phoneShowCode() })).toBeNull()
		expect(screen.getByRole('button', { name: m.revokeAllPhones() })).toBeTruthy()
	})

	it('returns to the device list after the current QR pairs, including when the invitation rotates', async () => {
		const navigate = openSettings(true)
		await screen.findByRole('img', { name: m.pairingQrCode() })
		mocks.invoke.mockResolvedValue(status('next-code', [firstPhone, secondPhone]))
		confirmPairing('current-code')
		expect(await screen.findByText(secondPhone.name)).toBeTruthy()
		expect(screen.queryByRole('img', { name: m.pairingQrCode() })).toBeNull()
		expect(navigate).toHaveBeenCalledExactlyOnceWith(false)
	})

	it('refreshes devices without navigating for a different invitation or while already on the overview', async () => {
		const navigate = openSettings(true)
		await screen.findByRole('img', { name: m.pairingQrCode() })
		mocks.invoke.mockResolvedValue(status('current-code', [firstPhone, secondPhone]))
		confirmPairing('old-code')
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
		expect(navigate).not.toHaveBeenCalled()
		expect(screen.getByRole('img', { name: m.pairingQrCode() })).toBeTruthy()
		cleanup()
		const overviewNavigation = openSettings()
		await screen.findByText(firstPhone.name)
		confirmPairing('current-code')
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(4))
		expect(overviewNavigation).not.toHaveBeenCalled()
	})

	it('revokes only the selected phone after the server confirms removal', async () => {
		mocks.invoke.mockResolvedValue(status('current-code', [firstPhone, secondPhone]))
		openSettings()
		await screen.findByText(firstPhone.name)
		let resolveRevoke!: (value: ReturnType<typeof status>) => void
		mocks.invoke.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRevoke = resolve
				}),
		)
		fireEvent.click(screen.getByRole('button', { name: m.phoneRevokeDeviceNamed({ name: firstPhone.name }) }))
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('handoff_revoke_device', { deviceId: firstPhone.id }))
		expect(screen.getByText(firstPhone.name)).toBeTruthy()
		await act(async () => resolveRevoke(status('current-code', [secondPhone])))
		expect(screen.queryByText(firstPhone.name)).toBeNull()
		expect(screen.getByText(secondPhone.name)).toBeTruthy()
		expect(screen.queryByRole('button', { name: m.revokeAllPhones() })).toBeNull()
	})

	it('keeps the device and shows the error when revocation fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		openSettings()
		await screen.findByText(firstPhone.name)
		mocks.invoke.mockRejectedValueOnce('Could not save paired devices')
		fireEvent.click(screen.getByRole('button', { name: m.phoneRevokeDeviceNamed({ name: firstPhone.name }) }))
		expect((await screen.findByRole('alert')).textContent).toContain('Could not save paired devices')
		expect(screen.getByText(firstPhone.name)).toBeTruthy()
	})

	it('ignores a pairing event for a device already revoked by the refreshed status', async () => {
		const navigate = openSettings(true)
		await screen.findByRole('img', { name: m.pairingQrCode() })
		confirmPairing('current-code')
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
		expect(navigate).not.toHaveBeenCalled()
	})

	it('queues pairing refreshes behind revocation so old responses cannot restore a revoked device', async () => {
		mocks.invoke.mockResolvedValue(status('current-code', [firstPhone, secondPhone]))
		openSettings()
		await screen.findByText(firstPhone.name)
		let resolveRevoke!: (value: ReturnType<typeof status>) => void
		mocks.invoke.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRevoke = resolve
				}),
		)
		fireEvent.click(screen.getByRole('button', { name: m.phoneRevokeDeviceNamed({ name: firstPhone.name }) }))
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
		confirmPairing('old-code', firstPhone)
		expect(mocks.invoke).toHaveBeenCalledTimes(2)
		mocks.invoke.mockResolvedValue(status('current-code', [secondPhone]))
		await act(async () => resolveRevoke(status('current-code', [secondPhone])))
		await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3))
		expect(screen.queryByText(firstPhone.name)).toBeNull()
		expect(screen.getByText(secondPhone.name)).toBeTruthy()
	})
})
