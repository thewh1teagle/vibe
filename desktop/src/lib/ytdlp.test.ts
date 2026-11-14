import { describe, expect, it } from 'vitest'
import { parseMediaLinks, splitMediaLinks } from './ytdlp'

describe('parseMediaLinks', () => {
	it('takes one link per line, or several on a line, without repeats', () => {
		expect(parseMediaLinks('https://a.example/1\nhttps://a.example/2\r\n\n  https://a.example/1 https://a.example/3  ')).toEqual([
			'https://a.example/1',
			'https://a.example/2',
			'https://a.example/3',
		])
		expect(parseMediaLinks('   ')).toEqual([])
	})

	it('keeps only http and https links, so nothing else can reach yt-dlp as an option', () => {
		expect(parseMediaLinks('--exec=touch https://a.example/1 -a file:///etc/passwd http://b.example/2 javascript:alert(1)')).toEqual([
			'https://a.example/1',
			'http://b.example/2',
		])
		expect(splitMediaLinks('hello https://a.example/1 --update-to=x').rest).toEqual(['hello', '--update-to=x'])
	})
})
