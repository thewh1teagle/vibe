import { describe, expect, it } from 'vitest'
import { autoProjectName, projectExportFilename } from './project-name'

describe('autoProjectName', () => {
	it.each([
		['record', 'capture.wav', 'Record-capture'],
		['url', 'video-title.m4a', 'Url-video-title'],
		['file', 'interview-final.mp3', 'File-interview-final'],
	] as const)('uses the stable ASCII prefix for %s projects', (source, name, expected) => {
		expect(autoProjectName(name, source)).toBe(expected)
	})

	it('defaults unannotated transcription inputs to files', () => {
		expect(autoProjectName('meeting.wav')).toBe('File-meeting')
	})

	it('preserves dots that are not supported media extensions', () => {
		expect(autoProjectName('meeting.notes')).toBe('File-meeting.notes')
	})
})

describe('projectExportFilename', () => {
	it.each([
		['File-interview-final.mp3', 'pdf', 'File-interview-final.pdf'],
		['Record-capture.WAV', '.docx', 'Record-capture.docx'],
		['team-standup', 'txt', 'team-standup.txt'],
		['Quarterly / review: final', 'md', 'Quarterly - review- final.md'],
		['NUL', 'json', '_NUL.json'],
		['   ', 'csv', 'transcript.csv'],
	] as const)('builds a safe export name from %s', (name, extension, expected) => {
		expect(projectExportFilename(name, extension)).toBe(expected)
	})
})
