import { describe, expect, it } from 'vitest'
import type { Segment, Word } from './transcript'
import { groupSegments, linesForExport, replaceSentence, segmentsOf, toParagraphs, toSentences, type LinesMode, type Sentence } from './transcript-grouping'

/** A segment as an engine with word timings delivers it: every word keeps its leading space, time shared by length. */
function timed(text: string, start: number, stop: number, speaker?: number): Segment {
	const tokens = text.trim().split(/\s+/)
	const total = tokens.reduce((sum, token) => sum + token.length, 0)
	let at = start
	const words: Word[] = tokens.map((token) => {
		const from = at
		at += ((stop - start) * token.length) / total
		return { start: Math.round(from), stop: Math.round(at), text: ` ${token}` }
	})
	return { start, stop, text, words, ...(speaker != null ? { speaker } : {}) }
}

/** Nemotron-style: a word every `step` centiseconds, each reported as ending 8 cs after it starts. */
function clipped(text: string, start: number, step = 30, speaker?: number): Segment {
	const words: Word[] = text
		.trim()
		.split(/\s+/)
		.map((token, index) => ({ start: start + index * step, stop: start + index * step + 8, text: ` ${token}` }))
	return { start, stop: words[words.length - 1].stop, text, words, ...(speaker != null ? { speaker } : {}) }
}

function plain(text: string, start: number, stop: number, speaker?: number): Segment {
	return { start, stop, text, ...(speaker != null ? { speaker } : {}) }
}

const texts = (segments: Segment[]) => toSentences(segments).map((sentence) => sentence.text)
const squeeze = (text: string) => text.replace(/\s+/g, '')

describe('toSentences', () => {
	it('rejoins a sentence the engine cut in half', () => {
		const cut = ['So the first thing we did was look at the', 'data from last year. It was bad.']
		const expected = ['So the first thing we did was look at the data from last year.', 'It was bad.']
		expect(texts([timed(cut[0], 0, 300), timed(cut[1], 300, 600)])).toEqual(expected)
		expect(texts([plain(cut[0], 0, 300), plain(cut[1], 300, 600)])).toEqual(expected)
		const [whole] = toSentences([timed(cut[0], 0, 300), timed(cut[1], 300, 600)])
		expect(whole.spans).toEqual([
			{ segment: 0, from: 0, to: cut[0].length },
			{ segment: 1, from: 0, to: 20 },
		])
		expect(whole.start).toBe(0)
		expect(whole.stop).toBeGreaterThan(300)
		expect(whole.stop).toBeLessThan(600)
	})

	it('splits a block of several sentences and keeps decimals, titles and initials whole', () => {
		const text = ' It took 3.5 weeks. Dr. Levi agreed! The U.S. team used v2.0 of e.g. the tool, etc. and left... quietly. "Really?" Yes.'
		const expected = ['It took 3.5 weeks.', 'Dr. Levi agreed!', 'The U.S. team used v2.0 of e.g. the tool, etc. and left... quietly.', '"Really?"', 'Yes.']
		expect(texts([timed(text, 0, 2000)])).toEqual(expected)
		expect(texts([plain(text, 0, 2000)])).toEqual(expected)
	})

	it('handles Hebrew, with its abbreviations marked by a geresh or gershayim', () => {
		const text = 'ד"ר לוי הגיע אחרי 3.5 שבועות. הוא הביא ספרים, מחברות וכו\' לצה״ל. מה שלומך? טוב!'
		const expected = ['ד"ר לוי הגיע אחרי 3.5 שבועות.', "הוא הביא ספרים, מחברות וכו' לצה״ל.", 'מה שלומך?', 'טוב!']
		expect(texts([timed(text, 0, 1500)])).toEqual(expected)
		expect(texts([plain(text, 0, 1500)])).toEqual(expected)
		expect(texts([timed('אתמול הלכנו אל', 0, 200), timed('הים. היה נהדר.', 200, 400)])).toEqual(['אתמול הלכנו אל הים.', 'היה נהדר.'])
	})

	it('splits Japanese delivered as one word per segment and joins it without spaces', () => {
		const first = '今日は天気がいいですね。明日は雨が降るでしょう。散歩に'
		const second = '行きましょう！「はい」と言った。'
		const expected = ['今日は天気がいいですね。', '明日は雨が降るでしょう。', '散歩に行きましょう！', '「はい」と言った。']
		const asWords: Segment[] = [
			{ start: 0, stop: 540, text: first, words: [{ start: 0, stop: 540, text: first }] },
			{ start: 540, stop: 860, text: second, words: [{ start: 540, stop: 860, text: second }] },
		]
		expect(texts(asWords)).toEqual(expected)
		expect(texts([plain(first, 0, 540), plain(second, 540, 860)])).toEqual(expected)
		const sentences = toSentences(asWords)
		expect(sentences[0].start).toBe(0)
		expect(sentences[1].start).toBe(240)
		expect(sentences[2].spans.map((span) => span.segment)).toEqual([0, 1])
		expect(texts([plain('これはVersion 3.5です。次へ。', 0, 300)])).toEqual(['これはVersion 3.5です。', '次へ。'])
	})

	it('ends the sentence when the speaker changes', () => {
		const sentences = toSentences([timed('I think we should', 0, 200, 0), timed('wait a second. No', 200, 400, 1), timed('we should not.', 400, 600, 0)])
		expect(sentences.map((sentence) => [sentence.speaker, sentence.text])).toEqual([
			[0, 'I think we should'],
			[1, 'wait a second.'],
			[1, 'No'],
			[0, 'we should not.'],
		])
	})

	it('ends the sentence at a silence of two seconds, and not at a shorter one', () => {
		expect(texts([timed('and then we waited', 0, 200), timed('for a while', 420, 600)])).toEqual(['and then we waited', 'for a while'])
		expect(texts([timed('and then we waited', 0, 200), timed('for a while', 380, 600)])).toEqual(['and then we waited for a while'])
	})

	it('sees the silence behind a word the engine stretched over it', () => {
		const stretched: Segment = {
			start: 0,
			stop: 400,
			text: ' we should go',
			words: [
				{ start: 0, stop: 30, text: ' we' },
				{ start: 30, stop: 70, text: ' should' },
				{ start: 70, stop: 400, text: ' go' },
			],
		}
		const sentences = toSentences([stretched, timed(' now please do it', 400, 520)])
		expect(sentences.map((sentence) => sentence.text)).toEqual(['we should go', 'now please do it'])
		expect(sentences[0].stop).toBeLessThan(200)
	})

	it('does not read pauses into word ends that all come 80 ms after the start', () => {
		const sentences = toSentences([clipped('hello there my good friend how are', 0), clipped('you doing today. fine thanks', 210), clipped('and now something else', 660)])
		expect(sentences.map((sentence) => sentence.text)).toEqual(['hello there my good friend how are you doing today.', 'fine thanks', 'and now something else'])
		expect(toParagraphs(sentences).map((paragraph) => paragraph.sentences.length)).toEqual([2, 1])
		expect(sentences[0].stop).toBeGreaterThan(270 + 8)
		expect(sentences[0].stop).toBeLessThanOrEqual(300)
	})

	it('cuts unpunctuated speech at short pauses once it runs long', () => {
		const words: Word[] = []
		let at = 0
		for (let index = 0; index < 300; index++) {
			words.push({ start: at, stop: at + 25, text: ` word${index % 10}` })
			at += index % 12 === 11 ? 105 : 25
		}
		const text = words.map((word) => word.text).join('')
		const sentences = toSentences([{ start: 0, stop: at, text, words }])
		expect(sentences.length).toBeGreaterThan(3)
		for (const sentence of sentences.slice(0, -1)) {
			expect(sentence.text.length).toBeGreaterThanOrEqual(200)
			expect(sentence.text.length).toBeLessThanOrEqual(400)
			expect(sentence.text.split(' ').length % 12).toBe(0)
		}
	})

	it('caps an endless sentence that has no pauses at all', () => {
		const text = Array.from({ length: 500 }, (_, index) => `token${index}`).join(' ')
		for (const segment of [plain(text, 0, 20000), timed(text, 0, 20000)]) {
			const sentences = toSentences([segment])
			expect(sentences.length).toBeGreaterThan(8)
			expect(Math.max(...sentences.map((sentence) => sentence.text.length))).toBeLessThanOrEqual(400)
			expect(sentences.map((sentence) => sentence.text).join(' ')).toBe(text)
		}
		const japanese = 'あいうえおかきくけこ'.repeat(100)
		const sentences = toSentences([plain(japanese, 0, 20000)])
		expect(sentences.length).toBeGreaterThan(4)
		expect(sentences.map((sentence) => sentence.text).join('')).toBe(japanese)
	})

	it('carries a sentence through an edited segment that lost its words', () => {
		const segments = [timed('The plan was to', 0, 150), plain('finish everything by Friday and', 150, 400), timed('ship it. Done.', 400, 520)]
		const sentences = toSentences(segments)
		expect(sentences.map((sentence) => sentence.text)).toEqual(['The plan was to finish everything by Friday and ship it.', 'Done.'])
		expect(sentences[0].spans.map((span) => span.segment)).toEqual([0, 1, 2])
	})

	it('ignores words that do not spell the segment text', () => {
		const stale: Segment = { ...timed('one two three. four', 0, 400), text: 'One, two. Three and four.' }
		expect(texts([stale])).toEqual(['One, two.', 'Three and four.'])
	})
})

describe('toParagraphs', () => {
	it('starts a paragraph after a pause of 2.6 s', () => {
		const segments = [timed('First point. Second point.', 0, 300), timed('Third point.', 300, 450), timed('A new topic. More on it.', 710, 1000)]
		const paragraphs = groupSegments(segments, 'paragraphs')
		expect(paragraphs.map((paragraph) => paragraph.sentences.map((sentence) => sentence.text))).toEqual([
			['First point.', 'Second point.', 'Third point.'],
			['A new topic.', 'More on it.'],
		])
		expect(paragraphs.map((paragraph) => [paragraph.start, paragraph.stop])).toEqual([
			[0, 450],
			[710, 1000],
		])
	})

	it('starts a paragraph when the speaker changes', () => {
		const paragraphs = groupSegments([timed('Hello. How are you?', 0, 200, 0), timed('Fine. And you?', 200, 400, 1), timed('Good.', 400, 450, 0)], 'paragraphs')
		expect(paragraphs.map((paragraph) => [paragraph.speaker, paragraph.sentences.length])).toEqual([
			[0, 2],
			[1, 2],
			[0, 1],
		])
		expect(segmentsOf(paragraphs[1])).toEqual([1])
	})

	it('ends a long paragraph at a sentence end', () => {
		const sentence = 'This sentence is exactly as long as it needs to be for the test.'
		const segments = Array.from({ length: 30 }, (_, index) => timed(sentence, index * 300, index * 300 + 300))
		const paragraphs = groupSegments(segments, 'paragraphs')
		expect(paragraphs.length).toBeGreaterThan(2)
		for (const paragraph of paragraphs.slice(0, -1)) {
			const length = paragraph.sentences.reduce((sum, each) => sum + each.text.length + 1, 0)
			expect(length).toBeGreaterThanOrEqual(600)
			expect(length).toBeLessThan(600 + sentence.length + 1)
		}
	})
})

describe('groupSegments and linesForExport', () => {
	const segments = [timed(' I went to the', 0, 200, 0), timed(' store today. Then home.', 200, 500, 0), plain('  ', 500, 510, 0), timed(' Why?', 800, 850, 1)]

	it('round-trips the original lines', () => {
		const rows = groupSegments(segments, 'original')
		expect(rows.map((row) => ({ start: row.start, stop: row.stop, text: row.sentences[0].text, speaker: row.speaker }))).toEqual(
			segments.map(({ start, stop, text, speaker }) => ({ start, stop, text: text.trim(), speaker })),
		)
		rows.forEach((row, index) => {
			expect(row.sentences).toHaveLength(1)
			expect(row.sentences[0].id).toBe(index)
			expect(row.sentences[0].spans).toEqual([{ segment: index, from: 0, to: segments[index].text.length }])
			expect(segmentsOf(row)).toEqual([index])
		})
		expect(linesForExport(segments, 'original')).toBe(segments)
	})

	it('gives one sentence per row in sentence mode', () => {
		const rows = groupSegments(segments, 'sentences')
		expect(rows.map((row) => row.sentences.map((sentence) => sentence.text))).toEqual([['I went to the store today.'], ['Then home.'], ['Why?']])
		expect(segmentsOf(rows[0])).toEqual([0, 1])
	})

	it('flattens rows into plain segments for export', () => {
		expect(linesForExport(segments, 'sentences').map((line) => line.text)).toEqual(['I went to the store today.', 'Then home.', 'Why?'])
		const lines = linesForExport(segments, 'paragraphs')
		expect(lines).toEqual([
			{ start: 0, stop: 500, text: 'I went to the store today. Then home.', speaker: 0 },
			{ start: 800, stop: 850, text: 'Why?', speaker: 1 },
		])
		expect(linesForExport([plain('今日は晴れ。', 0, 100), plain('明日は雨。', 100, 200)], 'paragraphs')).toEqual([{ start: 0, stop: 200, text: '今日は晴れ。明日は雨。' }])
		expect(linesForExport([plain('No speaker here.', 0, 100)], 'sentences')[0]).not.toHaveProperty('speaker')
	})
})

describe('replaceSentence', () => {
	it('replaces a sentence inside one segment', () => {
		const segments = [timed(' Before.', 0, 100), timed(' One two. Three four. Five.', 100, 400), timed(' After.', 400, 500)]
		const sentence = toSentences(segments)[2]
		expect(sentence.text).toBe('Three four.')
		const next = replaceSentence(segments, sentence, '  Changed here!  ')
		expect(next.map((segment) => segment.text)).toEqual([' Before.', ' One two. Changed here! Five.', ' After.'])
		expect(next[0]).toBe(segments[0])
		expect(next[2]).toBe(segments[2])
		expect(next[1]).toEqual({ start: 100, stop: 400, text: ' One two. Changed here! Five.' })
		expect(segments[1].words).toBeDefined()
		expect(replaceSentence(segments, sentence, '').map((segment) => segment.text)).toEqual([' Before.', ' One two. Five.', ' After.'])
		expect(replaceSentence(segments, toSentences(segments)[3], '')[1].text).toBe(' One two. Three four.')
		expect(replaceSentence(segments, toSentences(segments)[1], '')[1].text).toBe(' Three four. Five.')
	})

	it('returns the same segment when nothing changed', () => {
		const segments = [timed(' One two. Three four.', 0, 300)]
		const next = replaceSentence(segments, toSentences(segments)[1], 'Three four.')
		expect(next[0]).toBe(segments[0])
	})

	it('moves a sentence spanning two segments into the first', () => {
		const segments = [timed('I went to the', 0, 200, 0), timed('store today. Then home.', 200, 500, 0), timed('Bye.', 500, 550, 0)]
		const sentence = toSentences(segments)[0]
		const next = replaceSentence(segments, sentence, 'I stayed in.')
		expect(next).toHaveLength(3)
		expect(next[0]).toEqual({ start: 0, stop: sentence.stop, text: 'I stayed in.', speaker: 0 })
		expect(next[1]).toEqual({ start: sentence.stop, stop: 500, text: 'Then home.', speaker: 0 })
		expect(next[2]).toBe(segments[2])
		expect(sentence.stop).toBeGreaterThan(200)
		expect(texts(next)).toEqual(['I stayed in.', 'Then home.', 'Bye.'])
	})

	it('removes a segment the sentence consumed whole', () => {
		const segments = [timed('Well. I went to', 0, 200), timed('the very big', 200, 350), timed('store.', 350, 420), timed('Bye.', 420, 480)]
		const sentence = toSentences(segments)[1]
		expect(sentence.spans.map((span) => span.segment)).toEqual([0, 1, 2])
		const next = replaceSentence(segments, sentence, 'I left.')
		expect(next.map((segment) => segment.text)).toEqual(['Well. I left.', 'Bye.'])
		expect(next[0].stop).toBe(sentence.stop)
		expect(next[0].words).toBeUndefined()
		expect(next[1]).toBe(segments[3])
	})

	it('behaves like replacing the whole segment text in the original view', () => {
		const segments = [timed(' One two. Three.', 0, 300, 1), timed(' Four.', 300, 400, 1)]
		const sentence = groupSegments(segments, 'original')[0].sentences[0]
		const next = replaceSentence(segments, sentence, ' Whole new line ')
		expect(next[0]).toEqual({ start: 0, stop: 300, text: ' Whole new line ', speaker: 1 })
		expect(next[1]).toBe(segments[1])
		expect(replaceSentence(segments, sentence, '')[0].text).toBe('')
		expect(replaceSentence(segments, sentence, '')).toHaveLength(2)
	})

	it('joins Japanese without adding spaces', () => {
		const segments = [plain('今日は晴れ。散歩に', 0, 300), plain('行きましょう。では。', 300, 600)]
		const next = replaceSentence(segments, toSentences(segments)[1], '家にいます。')
		expect(next.map((segment) => segment.text)).toEqual(['今日は晴れ。家にいます。', 'では。'])
	})
})

function random(seed: number) {
	let state = seed
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const VOCABULARY = {
	english: ['the', 'meeting', 'Dr.', 'was', '3.5', 'hours', 'U.S.', 'budget', 'e.g.', 'okay', 'and', 'then', 'we', 'left', 'v2.0', '"quote"', "don't", 'I'],
	hebrew: ['שלום', 'ד"ר', 'לוי', "וכו'", 'הלכנו', 'אל', 'הים', 'מה', 'נשמע', 'צה״ל', '3.5', 'כן'],
	japanese: ['今日は', '天気が', 'いい', 'ですね', '東京', 'Version', '3.5', '「はい」', 'ありがとう', 'カタカナ'],
}
const ENDINGS = { english: ['.', '?', '!', '...', ','], hebrew: ['.', '?', '!', ','], japanese: ['。', '？', '！', '、'] }

/** A transcript of mixed quality: any language, with, without or with wrong word timings, gaps, speakers, blank lines. */
function randomTranscript(seed: number, count: number): Segment[] {
	const next = random(seed)
	const pick = <T>(items: T[]) => items[Math.floor(next() * items.length)]
	const language = pick(['english', 'hebrew', 'japanese'] as const)
	const punctuated = next() < 0.8
	const diarized = next() < 0.5
	const segments: Segment[] = []
	let clock = Math.floor(next() * 500)
	let speaker = 0
	for (let index = 0; index < count; index++) {
		clock += pick([0, 0, 0, 20, 90, 260, -15])
		clock = Math.max(0, clock)
		if (next() < 0.15) speaker = Math.floor(next() * 3)
		const tokens = Array.from({ length: 1 + Math.floor(next() * 14) }, () => {
			const word = pick(VOCABULARY[language])
			return punctuated && next() < 0.2 ? word + pick(ENDINGS[language]) : word
		})
		const glue = language === 'japanese' && next() < 0.8 ? '' : pick([' ', ' ', '  '])
		const text = next() < 0.05 ? pick(['', '   ']) : pick(['', ' ']) + tokens.join(glue) + pick(['', ' ', '\n'])
		const duration = 20 + Math.floor(next() * 600)
		const style = pick(['none', 'timed', 'timed', 'clipped', 'whole', 'wrong'])
		let segment: Segment = plain(text, clock, clock + duration, diarized ? speaker : undefined)
		if (text.trim() && style === 'timed') segment = { ...timed(text, clock, clock + duration, diarized ? speaker : undefined), text }
		if (text.trim() && style === 'clipped') segment = { ...clipped(text, clock, 25, diarized ? speaker : undefined), text }
		if (text.trim() && style === 'whole') segment.words = [{ start: clock, stop: clock + duration, text }]
		if (style === 'wrong') segment.words = [{ start: clock, stop: clock + duration, text: ' something else' }]
		segments.push(segment)
		clock = segment.stop
	}
	return segments
}

describe('invariants', () => {
	const transcripts = Array.from({ length: 150 }, (_, seed) => randomTranscript(seed + 1, 1 + ((seed * 7) % 40)))

	it('keeps every character exactly once, in order', () => {
		for (const segments of transcripts) {
			const stored = squeeze(segments.map((segment) => segment.text).join(' '))
			expect(squeeze(toSentences(segments).map((sentence) => sentence.text).join(' '))).toBe(stored)
			for (const mode of ['original', 'sentences', 'paragraphs'] as LinesMode[]) {
				const rows = groupSegments(segments, mode)
				expect(squeeze(rows.flatMap((row) => row.sentences.map((sentence) => sentence.text)).join(' '))).toBe(stored)
				expect(squeeze(linesForExport(segments, mode).map((line) => line.text).join(' '))).toBe(stored)
			}
		}
	})

	it('numbers sentences from zero and points their spans at their text', () => {
		for (const segments of transcripts) {
			const sentences = toSentences(segments)
			let previous = { segment: -1, to: 0 }
			sentences.forEach((sentence, index) => {
				expect(sentence.id).toBe(index)
				expect(sentence.text).toBe(sentence.text.trim())
				expect(sentence.text).not.toBe('')
				expect(squeeze(sentence.spans.map((span) => segments[span.segment].text.slice(span.from, span.to)).join(''))).toBe(squeeze(sentence.text))
				for (const span of sentence.spans) {
					expect(span.from).toBeLessThan(span.to)
					expect(span.segment > previous.segment || (span.segment === previous.segment && span.from >= previous.to)).toBe(true)
					expect(segments[span.segment].speaker).toBe(sentence.speaker)
					previous = span
				}
			})
			expect(toParagraphs(sentences).flatMap((paragraph) => paragraph.sentences)).toEqual(sentences)
		}
	})

	it('keeps times in order and inside the transcript', () => {
		for (const segments of transcripts) {
			const from = Math.min(...segments.map((segment) => segment.start))
			const to = Math.max(...segments.map((segment) => segment.stop))
			let clock = from
			for (const sentence of toSentences(segments)) {
				expect(sentence.start).toBeGreaterThanOrEqual(clock)
				expect(sentence.stop).toBeGreaterThanOrEqual(sentence.start)
				expect(sentence.stop).toBeLessThanOrEqual(to)
				clock = sentence.stop
			}
			clock = from
			for (const paragraph of groupSegments(segments, 'paragraphs')) {
				expect(paragraph.start).toBeGreaterThanOrEqual(clock)
				expect(paragraph.start).toBe(paragraph.sentences[0].start)
				expect(paragraph.stop).toBe(paragraph.sentences[paragraph.sentences.length - 1].stop)
				expect(new Set(paragraph.sentences.map((sentence) => sentence.speaker)).size).toBe(1)
				clock = paragraph.stop
			}
		}
	})

	it('keeps earlier sentences as they were when segments are appended', () => {
		for (const segments of transcripts.slice(0, 60)) {
			const full = toSentences(segments)
			for (let length = 1; length < segments.length; length++) {
				const partial = toSentences(segments.slice(0, length))
				expect(full.slice(0, Math.max(0, partial.length - 1))).toEqual(partial.slice(0, -1))
			}
		}
	})

	it('keeps the text and the untouched segments through any sentence replacement', () => {
		for (const segments of transcripts.slice(0, 60)) {
			const sentences = toSentences(segments)
			for (const sentence of sentences) {
				const touched = new Set(sentence.spans.map((span) => span.segment))
				const same = replaceSentence(segments, sentence, sentence.text)
				expect(squeeze(same.map((segment) => segment.text).join(''))).toBe(squeeze(segments.map((segment) => segment.text).join('')))
				const next = replaceSentence(segments, sentence, 'REPLACED')
				const others = sentences.filter((each) => each !== sentence).map((each) => squeeze(each.text))
				const expected = [...others.slice(0, sentence.id), 'REPLACED', ...others.slice(sentence.id)].join('')
				expect(squeeze(next.map((segment) => segment.text).join(''))).toBe(expected)
				const stored = segments.map((segment) => segment.text)
				if (!stored.some((each) => /\S\s{2,}\S/.test(each))) expect(next.some((segment) => /\s{2}REPLACED|REPLACED\s{2}/.test(segment.text))).toBe(false)
				if (!stored.some((each) => /[぀-ヿ一-鿿]/.test(each))) expect(next.some((segment) => /\SREPLACED|REPLACED\S/.test(segment.text))).toBe(false)
				segments.forEach((segment, index) => {
					if (!touched.has(index)) expect(next).toContain(segment)
				})
				for (const segment of next) {
					if (!segments.includes(segment)) expect(segment.words).toBeUndefined()
					expect(segment.stop).toBeGreaterThanOrEqual(segment.start)
				}
			}
		}
	})

	it('groups 20,000 words in well under 100 ms', () => {
		const next = random(7)
		const segments: Segment[] = []
		let clock = 0
		for (let index = 0; index < 2000; index++) {
			const tokens = Array.from({ length: 10 }, () => VOCABULARY.english[Math.floor(next() * VOCABULARY.english.length)])
			if (next() < 0.5) tokens[9] += '.'
			segments.push(timed(` ${tokens.join(' ')}`, clock, clock + 300))
			clock += next() < 0.05 ? 560 : 300
		}
		let best = Number.POSITIVE_INFINITY
		let rows = 0
		for (let run = 0; run < 5; run++) {
			const began = performance.now()
			rows = groupSegments(segments, 'paragraphs').length
			best = Math.min(best, performance.now() - began)
		}
		console.log(`20,000 words -> ${rows} paragraphs in ${best.toFixed(1)} ms`)
		expect(rows).toBeGreaterThan(10)
		expect(best).toBeLessThan(100)
	})
})

describe('sentence shape', () => {
	it('never yields an empty sentence for blank input', () => {
		expect(toSentences([])).toEqual([])
		expect(toSentences([plain('', 0, 10), plain('   ', 10, 20)])).toEqual([])
		expect(groupSegments([plain('   ', 10, 20)], 'paragraphs')).toEqual([])
		const only: Sentence[] = toSentences([plain(' Hi. ', 0, 50)])
		expect(only).toEqual([{ id: 0, start: 0, stop: 50, text: 'Hi.', speaker: undefined, spans: [{ segment: 0, from: 1, to: 4 }] }])
	})
})
