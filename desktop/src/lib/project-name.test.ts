import { describe, expect, it } from 'vitest'
import { autoProjectName } from './project-name'

describe('autoProjectName', () => {
	it.each([
		['record', 'capture.wav', 'Record-capture.wav'],
		['url', 'video-title.m4a', 'Url-video-title.m4a'],
		['file', 'interview-final.mp3', 'File-interview-final.mp3'],
	] as const)('uses the stable ASCII prefix for %s projects', (source, name, expected) => {
		expect(autoProjectName(name, source)).toBe(expected)
	})

	it('defaults unannotated transcription inputs to files', () => {
		expect(autoProjectName('meeting.wav')).toBe('File-meeting.wav')
	})
})
