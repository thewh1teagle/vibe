import type { Segment } from './transcript'

/** How the transcript's lines are laid out: as the engine cut them, or rebuilt. */
export type LinesMode = 'original' | 'sentences' | 'paragraphs'

/** A slice of one stored segment's text: characters [from, to) of segments[segment].text */
export interface Span {
	segment: number
	from: number
	to: number
}

export interface Sentence {
	/** Position among all sentences of the transcript, in order. */
	id: number
	start: number
	stop: number
	text: string
	speaker?: number
	/** Where this sentence's text lives in the stored segments, in order. */
	spans: Span[]
}

export interface Paragraph {
	start: number
	stop: number
	speaker?: number
	sentences: Sentence[]
}

/** Silence between two words that ends the sentence, in centiseconds. */
const SENTENCE_PAUSE_CS = 200
/** Silence before a sentence that starts a new paragraph. */
const PARAGRAPH_PAUSE_CS = 200
/** A sentence past this length ends at its next short pause; text without punctuation needs it. */
const SOFT_SENTENCE_CHARS = 200
const SOFT_PAUSE_CS = 70
/** No sentence grows past this; it is cut at a word boundary. */
const MAX_SENTENCE_CHARS = 400
/** A paragraph past this length ends at its next sentence end. */
const MAX_PARAGRAPH_CHARS = 600
/** Fast speech still spends this long on a character, so a word cannot have ended sooner. */
const WORD_FLOOR_CS_PER_CHAR = 4
/** A word lasting longer than this many median words was stretched over silence by the engine. */
const MEDIAN_WORD_FACTOR = 2.5
/** The cap never drops below this, for engines whose word ends carry no information. */
const MIN_WORD_CAP_CS = 50
const DURATION_BUCKETS = 1024

const SPACE = /\s/
const TOKEN = /\S+/g
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
const ENDS_WITHOUT_SPACE =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\u3000-\u303f\uff00-\uff65]$/u
const OPENER = /[「『（【《〈〔“‘([{]/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const MARK = /\p{M}/u
const SENTENCE_END = /([.!?…。！？．｡؟۔।॥։።]+)["'”’»›)\]}」』）】》〉׳״]*$/u
const ELLIPSIS = /^(?:[.…]{2,}|…)$/u
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u
const INITIALS = /^(?:\p{L}\.)+\p{L}$/u
const SINGLE_CAPITAL = /^\p{Lu}$/u
const STARTS_WITH_DIGIT = /^\p{N}/u
const STARTS_LOWERCASE = /^\p{Ll}/u
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'inc', 'jr', 'sr'])

/** One word of the flat stream, or one character of a script written without spaces. */
interface Unit {
	segment: number
	from: number
	to: number
	start: number
	stop: number
	/** Where the word really ended, for measuring the silence after it. */
	end: number
	speaker?: number
	/** Whitespace, or a segment boundary, precedes it. */
	spaced: boolean
	/** Its times come from the engine's word timings rather than a share of the segment. */
	timed: boolean
	/** Its length for the sentence limits; a character of a no-space script counts double. */
	weight: number
}

/** A stretch of a segment's text with known times. */
interface Timed {
	from: number
	to: number
	start: number
	stop: number
}

function isSpace(char: string): boolean {
	const code = char.charCodeAt(0)
	return code > 32 && code < 128 ? false : SPACE.test(char)
}

/** Character ranges of the segment's words, or null when they do not spell the segment's text. */
function wordRanges(segment: Segment): Timed[] | null {
	const words = segment.words
	if (!words?.length) return null
	const text = segment.text
	const ranges: Timed[] = []
	let at = 0
	for (const word of words) {
		if (!Number.isFinite(word.start) || !Number.isFinite(word.stop)) return null
		let from = -1
		for (let k = 0; k < word.text.length; k++) {
			const char = word.text[k]
			if (isSpace(char)) continue
			while (at < text.length && isSpace(text[at])) at++
			if (text[at] !== char) return null
			if (from < 0) from = at
			at++
		}
		if (from >= 0) ranges.push({ from, to: at, start: word.start, stop: word.stop })
	}
	while (at < text.length && isSpace(text[at])) at++
	return at === text.length && ranges.length > 0 ? ranges : null
}

function timeInside(range: Timed, position: number): number {
	const share = (position - range.from) / Math.max(1, range.to - range.from)
	return range.start + (range.stop - range.start) * Math.min(1, Math.max(0, share))
}

/**
 * Where a whitespace-delimited token is cut further: after sentence terminators and between the
 * characters of a no-space script, keeping Latin runs ("3.5", "Tokyo") and attached punctuation whole.
 */
function cutPoints(token: string): number[] {
	const cuts: number[] = []
	let previous = ''
	let base = ''
	for (let k = 0; k < token.length; ) {
		const char = String.fromCodePoint(token.codePointAt(k) ?? 0)
		let kind = 'punctuation'
		if (NO_SPACE_SCRIPT.test(char)) kind = 'ideograph'
		else if (OPENER.test(char)) kind = 'opener'
		else if (MARK.test(char)) kind = 'mark'
		else if (LETTER_OR_DIGIT.test(char)) kind = 'letter'
		const cut = k > 0 && (kind === 'ideograph' || kind === 'opener' ? previous !== 'opener' : kind === 'letter' && base === 'ideograph')
		if (cut) cuts.push(k)
		if (cut) base = ''
		if (kind === 'ideograph' || kind === 'letter') base = kind
		previous = kind
		k += char.length
	}
	return cuts
}

/** Lower median of word durations seen so far, kept current as words arrive. */
class RunningMedian {
	private counts = new Uint32Array(DURATION_BUCKETS)
	private total = 0
	private below = 0
	value = 0

	add(duration: number) {
		const bucket = Math.min(DURATION_BUCKETS - 1, Math.max(0, Math.round(duration)))
		this.counts[bucket]++
		this.total++
		if (bucket < this.value) this.below++
		const rank = (this.total - 1) >> 1
		while (rank >= this.below + this.counts[this.value]) this.below += this.counts[this.value++]
		while (rank < this.below) this.below -= this.counts[--this.value]
	}
}

/**
 * Every word of the transcript in order, whichever segment it sits in. A segment without usable word
 * timings shares its time out by character position. Times never run backwards.
 */
function wordStream(segments: Segment[]): Unit[] {
	const units: Unit[] = []
	const median = new RunningMedian()
	let clock = Number.NEGATIVE_INFINITY
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index]
		const text = segment.text
		const first = units.length
		const segmentStop = Math.max(segment.start, segment.stop)
		const words = wordRanges(segment)
		const ranges = words ?? [{ from: text.length - text.trimStart().length, to: text.trimEnd().length, start: segment.start, stop: segmentStop }]
		const speaker = segment.speaker ?? undefined
		let range = 0
		for (const match of text.matchAll(TOKEN)) {
			const token = match[0]
			const offset = match.index ?? 0
			const wide = NO_SPACE_SCRIPT.test(token)
			const cuts = wide ? cutPoints(token) : []
			for (let piece = 0; piece <= cuts.length; piece++) {
				const from = offset + (piece === 0 ? 0 : cuts[piece - 1])
				const to = offset + (piece === cuts.length ? token.length : cuts[piece])
				while (range < ranges.length - 1 && ranges[range].to <= from) range++
				let last = range
				while (last < ranges.length - 1 && ranges[last].to < to) last++
				const begins = from <= ranges[range].from ? ranges[range].start : timeInside(ranges[range], from)
				const ends = to >= ranges[last].to ? ranges[last].stop : timeInside(ranges[last], to)
				const start = Math.max(clock, Math.min(segmentStop, Math.max(segment.start, Math.round(begins))))
				const stop = Math.max(start, Math.min(segmentStop, Math.round(ends)))
				clock = start
				const ideographic = wide && NO_SPACE_SCRIPT.test(text.slice(from, to))
				units.push({ segment: index, from, to, start, stop, end: stop, speaker, spaced: piece === 0, timed: words !== null, weight: (to - from) * (ideographic ? 2 : 1) })
				median.add(stop - start)
			}
		}
		const cap = Math.max(MIN_WORD_CAP_CS, MEDIAN_WORD_FACTOR * median.value)
		for (let k = first; k < units.length; k++) {
			const unit = units[k]
			const floor = Math.min(cap, (unit.to - unit.from) * WORD_FLOOR_CS_PER_CHAR)
			unit.end = unit.start + Math.round(Math.min(cap, Math.max(floor, unit.stop - unit.start)))
		}
	}
	return units
}

/** Whether a word closes its sentence: "3.5", "Dr." and "U.S." do not, and "..." before a lowercase word is a hesitation. */
function endsSentence(word: string, next: string, nextAttached: boolean): boolean {
	const match = SENTENCE_END.exec(word)
	if (!match) return false
	const mark = match[1]
	if (mark === '.') {
		if (nextAttached && STARTS_WITH_DIGIT.test(next)) return false
		const core = word.slice(0, match.index).replace(LEADING_PUNCTUATION, '')
		if (ABBREVIATIONS.has(core.toLowerCase())) return false
		if (INITIALS.test(core) || (SINGLE_CAPITAL.test(core) && core !== 'I')) return false
	} else if (ELLIPSIS.test(mark) && STARTS_LOWERCASE.test(next)) {
		return false
	}
	return true
}

function joinTexts(parts: string[]): string {
	let text = ''
	for (const part of parts) {
		if (!part) continue
		text += text && !ENDS_WITHOUT_SPACE.test(text) ? ` ${part}` : part
	}
	return text
}

/**
 * Sentences rebuilt from the words of all segments, so one cut in half by the engine is whole again.
 * A sentence ends at its punctuation, a speaker change or a long silence; unpunctuated speech is cut
 * at shorter pauses once it runs long. Appending segments never changes any sentence but the last.
 */
export function toSentences(segments: Segment[]): Sentence[] {
	const units = wordStream(segments)
	const sentences: Sentence[] = []
	let first = 0
	let chars = 0
	for (let k = 0; k < units.length; k++) {
		const unit = units[k]
		const next = units[k + 1]
		chars += unit.weight + (k > first && unit.spaced ? 1 : 0)
		if (next) {
			const pause = next.start - unit.end
			const crossesUntimed = !unit.timed && next.segment !== unit.segment
			const ends =
				next.speaker !== unit.speaker ||
				pause >= SENTENCE_PAUSE_CS ||
				(chars >= SOFT_SENTENCE_CHARS && (pause >= SOFT_PAUSE_CS || crossesUntimed)) ||
				chars + next.weight + 1 > MAX_SENTENCE_CHARS ||
				endsSentence(
					segments[unit.segment].text.slice(unit.from, unit.to),
					segments[next.segment].text.slice(next.from, next.to),
					!next.spaced && next.segment === unit.segment,
				)
			if (!ends) continue
		}
		const spans: Span[] = []
		for (let j = first; j <= k; j++) {
			const span = spans[spans.length - 1]
			if (span && span.segment === units[j].segment) span.to = units[j].to
			else spans.push({ segment: units[j].segment, from: units[j].from, to: units[j].to })
		}
		const limit = next ? next.start : Math.max(unit.stop, segments[unit.segment].stop)
		sentences.push({
			id: sentences.length,
			start: units[first].start,
			stop: Math.min(unit.end, limit),
			text: joinTexts(spans.map((span) => segments[span.segment].text.slice(span.from, span.to))),
			speaker: unit.speaker,
			spans,
		})
		first = k + 1
		chars = 0
	}
	return sentences
}

/** Sentences joined until the speaker changes, a long pause, or the paragraph is long enough. */
export function toParagraphs(sentences: Sentence[]): Paragraph[] {
	const paragraphs: Paragraph[] = []
	let chars = 0
	for (const sentence of sentences) {
		const last = paragraphs[paragraphs.length - 1]
		const breaks = !last || last.speaker !== sentence.speaker || sentence.start - last.stop >= PARAGRAPH_PAUSE_CS || chars >= MAX_PARAGRAPH_CHARS
		if (breaks) {
			paragraphs.push(row(sentence))
			chars = sentence.text.length
		} else {
			last.sentences.push(sentence)
			last.stop = Math.max(last.stop, sentence.stop)
			chars += sentence.text.length + 1
		}
	}
	return paragraphs
}

function row(sentence: Sentence): Paragraph {
	return { start: sentence.start, stop: sentence.stop, speaker: sentence.speaker, sentences: [sentence] }
}

/**
 * Rows for a view. 'original': one paragraph per segment holding one sentence whose single span is
 * the whole segment and whose text is the segment's trimmed text. 'sentences': one sentence per paragraph.
 */
export function groupSegments(segments: Segment[], mode: LinesMode): Paragraph[] {
	if (mode === 'original') {
		return segments.map((segment, index) =>
			row({
				id: index,
				start: segment.start,
				stop: segment.stop,
				text: segment.text.trim(),
				speaker: segment.speaker ?? undefined,
				spans: [{ segment: index, from: 0, to: segment.text.length }],
			}),
		)
	}
	const sentences = toSentences(segments)
	return mode === 'paragraphs' ? toParagraphs(sentences) : sentences.map(row)
}

/** The text with [from, to) replaced, or taken out when there is no replacement, leaving one space at most where the pieces meet. */
function splice(text: string, from: number, to: number, replacement: string | null): string {
	const begin = Math.min(Math.max(0, from), text.length)
	const left = text.slice(0, begin)
	const right = text.slice(Math.min(Math.max(begin, to), text.length))
	if (replacement !== null && !left && !right) return replacement
	const middle = replacement?.trim() ?? ''
	if (middle) return left + middle + right
	const before = left.trimEnd()
	const after = right.trimStart()
	if (!before) return left + after
	if (!after) return before + right
	const spaced = before.length < left.length || after.length < right.length
	return before + (spaced ? ' ' : '') + after
}

/**
 * The stored segments after the user replaced one sentence's text. The text goes where the sentence
 * began; the parts it had in later segments leave them, and a later segment left empty is removed.
 * A segment whose text changed drops its word timings; untouched segments are returned as they are.
 */
export function replaceSentence(segments: Segment[], sentence: Sentence, text: string): Segment[] {
	const home = sentence.spans[0]
	if (!home || !segments[home.segment]) return segments
	const texts = new Map<number, string>()
	const beheaded = new Set<number>()
	let moved = false
	for (let k = sentence.spans.length - 1; k >= 0; k--) {
		const span = sentence.spans[k]
		const segment = segments[span.segment]
		if (!segment) continue
		const current = texts.get(span.segment) ?? segment.text
		texts.set(span.segment, splice(current, span.from, span.to, k === 0 ? text : null))
		if (span.segment === home.segment) continue
		moved = true
		if (!segment.text.slice(0, span.from).trim()) beheaded.add(span.segment)
	}
	return segments.flatMap((segment, index) => {
		const next = texts.get(index)
		if (next === undefined) return [segment]
		if (index !== home.segment && !next.trim()) return []
		let { start, stop } = segment
		if (index === home.segment && moved) stop = Math.max(stop, sentence.stop)
		if (beheaded.has(index)) start = Math.min(Math.max(start, sentence.stop), stop)
		if (next === segment.text && start === segment.start && stop === segment.stop) return [segment]
		const changed: Segment = { ...segment, start, stop, text: next }
		if (next !== segment.text) delete changed.words
		return [changed]
	})
}

/** The segments a row touches (for assigning a speaker). */
export function segmentsOf(paragraph: Paragraph): number[] {
	const indexes = new Set<number>()
	for (const sentence of paragraph.sentences) {
		for (const span of sentence.spans) indexes.add(span.segment)
	}
	return [...indexes]
}

/**
 * Rows flattened back into plain segments for readable exports (txt, docx, pdf...).
 * 'original' returns the input unchanged.
 */
export function linesForExport(segments: Segment[], mode: LinesMode): Segment[] {
	if (mode === 'original') return segments
	return groupSegments(segments, mode).map((paragraph) => ({
		start: paragraph.start,
		stop: paragraph.stop,
		text: joinTexts(paragraph.sentences.map((sentence) => sentence.text)),
		...(paragraph.speaker != null ? { speaker: paragraph.speaker } : {}),
	}))
}
