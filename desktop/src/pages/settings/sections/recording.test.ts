// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { normalizePermissionStatus } from './recording'

describe('recording permission responses', () => {
	it('keeps native permission statuses intact', () => {
		expect(normalizePermissionStatus('not_determined')).toBe('not_determined')
		expect(normalizePermissionStatus('restricted')).toBe('restricted')
	})

	it('accepts the legacy boolean system-audio response', () => {
		expect(normalizePermissionStatus(true)).toBe('granted')
		expect(normalizePermissionStatus(false)).toBe('denied')
	})
})
