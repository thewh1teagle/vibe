import { describe, expect, it } from 'vitest'
import { asText, speakerName, type Segment } from './transcript'

const segments: Segment[] = [
	{ start: 0, stop: 100, text: 'Hi', speaker: 0 },
	{ start: 100, stop: 200, text: 'Hello', speaker: 1 },
]

describe('speakerName', () => {
	it('prefers the chosen name and falls back to a numbered label', () => {
		expect(speakerName(0, 'Speaker', { 0: 'Jim' })).toBe('Jim')
		expect(speakerName(1, 'Speaker', { 0: 'Jim' })).toBe('Speaker 2')
		expect(speakerName(0, 'Speaker', { 0: '   ' })).toBe('Speaker 1')
		expect(speakerName(0, 'Sprecher')).toBe('Sprecher 1')
	})

	it('reaches the plain-text serializer', () => {
		expect(asText(segments, 'Speaker', { 1: 'Susan' })).toBe('[Speaker 1] Hi\n[Susan] Hello\n')
	})
})
