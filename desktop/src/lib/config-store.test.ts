import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `loadConfigStore` swallows a failed store call and falls back to defaults, and the browser dev
 * mock implements every store command, so a missing capability is invisible until a real build
 * runs — where it silently resets every setting on launch (#1424, shipped in 3.1.1 because
 * `store:allow-entries` was not granted). Assert the grant statically instead.
 */
describe('store capability', () => {
	const capabilities = JSON.parse(readFileSync(join(__dirname, '../../src-tauri/capabilities/main.json'), 'utf8'))
	const permissions: string[] = capabilities.permissions.filter((p: unknown) => typeof p === 'string')

	it('covers every store command the config layer uses', () => {
		// `load` and `entries` are the read path; without both, settings never come back.
		const required = ['load', 'entries', 'set', 'delete', 'get', 'has', 'clear', 'reset', 'save', 'get-store']
		const missing = required.filter((command) => !permissions.includes('store:default') && !permissions.includes(`store:allow-${command}`))
		expect(missing).toEqual([])
	})
})
