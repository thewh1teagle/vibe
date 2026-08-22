import { describe, expect, it } from 'vitest'
import { validPath } from './media'

describe('validPath', () => {
	it('accepts a media extension whatever its case', () => {
		expect(validPath('/tmp/interview.mp3')).toBe(true)
		expect(validPath('/tmp/interview.MP3')).toBe(true)
		expect(validPath('C:\\Users\\me\\call 17.8.2026.MOV')).toBe(true)
	})

	it('rejects anything else, including a name that merely ends with an extension', () => {
		expect(validPath('/tmp/notes.pdf')).toBe(false)
		expect(validPath('/tmp/notesmp3')).toBe(false)
		expect(validPath('/tmp/recording')).toBe(false)
	})
})
