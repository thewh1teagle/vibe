import { describe, expect, it } from 'vitest'
import { issueTitleFrom } from './app'

describe('issueTitleFrom', () => {
	it('takes the message out of a tracing json line', () => {
		const log = '{"timestamp":"2026-08-22T11:05:32Z","level":"ERROR","fields":{"message":"vibe-server process died while loading a model"}}'
		expect(issueTitleFrom(log)).toBe('vibe-server process died while loading a model')
	})

	it('strips the timestamp and level from a plain line', () => {
		expect(issueTitleFrom('2026-08-22T11:05:32Z ERROR: failed to read server event line')).toBe('failed to read server event line')
	})

	it('skips empty and useless lines', () => {
		expect(issueTitleFrom('\n  \nInvalid JSON\nno model loaded')).toBe('no model loaded')
	})

	it('shortens a long line instead of filling the tracker with paragraphs', () => {
		const title = issueTitleFrom('x'.repeat(200))
		expect(title).toHaveLength(90)
		expect(title.endsWith('…')).toBe(true)
	})

	it('falls back when the log says nothing', () => {
		expect(issueTitleFrom('')).toBe('App reports bug')
	})
})
