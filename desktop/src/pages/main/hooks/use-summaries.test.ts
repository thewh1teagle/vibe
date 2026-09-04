// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { DEFAULT_AI } from '~/lib/ai'
import type { Job } from './use-transcribe-queue'
import { shouldAutoSummarize } from './use-summaries'

const segments = [{ start: 0, stop: 1, text: 'New transcript' }]

function completed(overrides: Partial<Pick<Job, 'status' | 'hydrated' | 'summary' | 'segments'>> = {}) {
	return { status: 'done', hydrated: false, summary: undefined, segments, ...overrides } as Pick<Job, 'status' | 'hydrated' | 'summary' | 'segments'>
}

describe('automatic summaries', () => {
	it('is opt-in by default', () => {
		expect(DEFAULT_AI.tasks.summary.autoOnFinish).toBe(false)
	})

	it('runs only when a session job transitions to done', () => {
		expect(shouldAutoSummarize(completed(), 'running')).toBe(true)
		expect(shouldAutoSummarize(completed(), undefined)).toBe(false)
		expect(shouldAutoSummarize(completed(), 'done')).toBe(false)
	})

	it('never auto-runs for hydrated, empty, or already summarized jobs', () => {
		expect(shouldAutoSummarize(completed({ hydrated: true }), 'running')).toBe(false)
		expect(shouldAutoSummarize(completed({ segments: [] }), 'running')).toBe(false)
		expect(shouldAutoSummarize(completed({ summary: 'Existing' }), 'running')).toBe(false)
	})
})
