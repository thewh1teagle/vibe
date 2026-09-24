// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AudioDeviceInput from './audio-device-input'
import type { AudioDevice } from '~/lib/audio'

const mocks = vi.hoisted(() => ({
	listen: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('~/lib/audio', async (importOriginal) => {
	const actual = await importOriginal<typeof import('~/lib/audio')>()
	return {
		...actual,
		startInputLevelPreview: mocks.start,
		stopInputLevelPreview: mocks.stop,
	}
})

const mic: AudioDevice = { id: '1', name: 'Built-in Mic', isDefault: true, isInput: true }
const speaker: AudioDevice = { id: '2', name: 'Speakers', isDefault: true, isInput: false }

beforeEach(() => {
	// jsdom has no layout; Radix Select calls this when the popover opens.
	Element.prototype.scrollIntoView = vi.fn()
	vi.clearAllMocks()
	mocks.listen.mockResolvedValue(vi.fn())
	mocks.start.mockResolvedValue(undefined)
	mocks.stop.mockResolvedValue(undefined)
})

afterEach(cleanup)

function renderInput(overrides: Partial<Parameters<typeof AudioDeviceInput>[0]> = {}) {
	return render(
		<AudioDeviceInput
			type="input"
			devices={[mic, speaker]}
			device={mic}
			setDevice={vi.fn()}
			{...overrides}
		/>,
	)
}

describe('input level preview lifecycle', () => {
	it('starts the preview when the microphone dropdown opens and stops it when it closes', async () => {
		renderInput()
		fireEvent.click(screen.getByRole('combobox'))
		await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1))
		expect(mocks.listen).toHaveBeenCalledWith('input_level', expect.any(Function))

		fireEvent.keyDown(document, { key: 'Escape' })
		await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1))
	})

	it('does not touch the preview for the speakers dropdown', async () => {
		renderInput({ type: 'output', device: speaker })
		fireEvent.click(screen.getByRole('combobox'))
		// "None" only exists inside the open list; the closed trigger shows the selected speaker.
		await waitFor(() => expect(screen.getAllByText('None')).toHaveLength(1))
		expect(mocks.start).not.toHaveBeenCalled()
		expect(mocks.stop).not.toHaveBeenCalled()
	})

	it('stops the preview if the component unmounts while open', async () => {
		const { unmount } = renderInput()
		fireEvent.click(screen.getByRole('combobox'))
		await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1))

		unmount()
		await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1))
	})
})
