// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShortcutRecorder from './shortcut-recorder'
import { m } from '~/paraglide/messages.js'

afterEach(cleanup)

describe('shortcut capture lifecycle', () => {
	it('resumes the global shortcut when Settings closes during capture', () => {
		const onCapturingChange = vi.fn()
		const { unmount } = render(<ShortcutRecorder value="Alt+Space" onChange={vi.fn()} onCapturingChange={onCapturingChange} />)
		fireEvent.click(screen.getByRole('button', { name: m.changeShortcut() }))
		expect(onCapturingChange).toHaveBeenLastCalledWith(true)
		unmount()
		expect(onCapturingChange).toHaveBeenLastCalledWith(false)
	})

	it('accepts Option + Space with only one modifier and finishes capture', () => {
		const onChange = vi.fn()
		const onCapturingChange = vi.fn()
		render(<ShortcutRecorder value="CmdOrCtrl+Shift+Space" onChange={onChange} onCapturingChange={onCapturingChange} />)
		fireEvent.click(screen.getByRole('button', { name: m.changeShortcut() }))
		fireEvent.keyDown(window, { code: 'Space', key: '\u00a0', altKey: true })
		expect(onChange).toHaveBeenCalledWith('Alt+Space')
		expect(onCapturingChange).toHaveBeenLastCalledWith(false)
	})
})
