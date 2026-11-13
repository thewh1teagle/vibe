import { describe, expect, it } from 'vitest'
import { parseMediaLinks } from './ytdlp'

describe('parseMediaLinks', () => {
	it('takes one link per line, or several on a line, without repeats', () => {
		expect(parseMediaLinks('https://a.example/1\nhttps://a.example/2\r\n\n  https://a.example/1 https://a.example/3  ')).toEqual([
			'https://a.example/1',
			'https://a.example/2',
			'https://a.example/3',
		])
		expect(parseMediaLinks('   ')).toEqual([])
	})
})
