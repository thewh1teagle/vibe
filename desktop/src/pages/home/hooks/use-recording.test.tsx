// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { createContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecording } from './use-recording'

const { invoke, emit, startKeepAwake, stopKeepAwake, setErrorModal } = vi.hoisted(() => ({
	invoke: vi.fn(),
	emit: vi.fn(),
	startKeepAwake: vi.fn(),
	stopKeepAwake: vi.fn(),
	setErrorModal: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ emit }))
vi.mock('~/lib/config-store', () => ({ usePersisted: (_key: string, initial: unknown) => [initial, vi.fn()] }))
vi.mock('~/lib/keep-awake', () => ({ KEEP_AWAKE: { record: 'record' }, startKeepAwake, stopKeepAwake }))
vi.mock('~/lib/permissions', () => ({ ensureSystemAudioPermission: vi.fn().mockResolvedValue(true) }))
vi.mock('~/providers/preference', () => ({ usePreferenceProvider: () => ({ homeTab: 'files' }) }))
vi.mock('~/providers/error-modal', () => ({ ErrorModalContext: createContext({ setState: setErrorModal }) }))

beforeEach(() => {
	vi.clearAllMocks()
})
afterEach(cleanup)

describe('manual recording controls', () => {
	it('waits for the native stop listener before sending stop', async () => {
		let finishStart!: () => void
		invoke.mockReturnValue(new Promise<void>((resolve) => { finishStart = resolve }))
		emit.mockResolvedValue(undefined)
		const { result } = renderHook(() => useRecording(vi.fn()))
		let start!: Promise<void>
		let stop!: Promise<void>
		act(() => {
			start = result.current.startRecord()
			stop = result.current.stopRecord()
		})
		expect(emit).not.toHaveBeenCalled()
		await act(async () => {
			finishStart()
			await Promise.all([start, stop])
		})
		expect(emit).toHaveBeenCalledExactlyOnceWith('stop_record')
	})

	it('keeps Stop available after an event delivery error so it can be retried', async () => {
		invoke.mockResolvedValue(undefined)
		emit.mockRejectedValueOnce(new Error('delivery failed')).mockResolvedValueOnce(undefined)
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { result } = renderHook(() => useRecording(vi.fn()))
			await act(async () => { await result.current.startRecord() })
			expect(result.current.isRecording).toBe(true)
			await act(async () => { await result.current.stopRecord() })
			expect(result.current.isRecording).toBe(true)
			expect(stopKeepAwake).not.toHaveBeenCalled()
			expect(setErrorModal).toHaveBeenCalledWith({ log: 'Error: delivery failed', open: true })
			await act(async () => { await result.current.stopRecord() })
			expect(emit).toHaveBeenCalledTimes(2)
		} finally {
			consoleError.mockRestore()
		}
	})

	it('does not send stop when starting the recorder fails', async () => {
		let failStart!: (error: Error) => void
		invoke.mockReturnValue(new Promise<void>((_resolve, reject) => { failStart = reject }))
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { result } = renderHook(() => useRecording(vi.fn()))
			let start!: Promise<void>
			let stop!: Promise<void>
			act(() => {
				start = result.current.startRecord()
				stop = result.current.stopRecord()
			})
			await act(async () => {
				failStart(new Error('device unavailable'))
				await Promise.all([start, stop])
			})
			expect(result.current.isRecording).toBe(false)
			expect(emit).not.toHaveBeenCalled()
			expect(stopKeepAwake).toHaveBeenCalledWith('record')
		} finally {
			consoleError.mockRestore()
		}
	})
})
