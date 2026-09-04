import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS } from './config-keys'
import { composeSkill, withFrontmatter, type SkillContext } from './skill'

const context: SkillContext = {
	baseUrl: 'http://127.0.0.1:51234',
	serverSkill: '# Server Local Transcription API\n\nBase URL: http://127.0.0.1:51234\n',
	transcriptsFolder: '/Users/me/Documents/Vibe',
	configPath: '/Users/me/Library/Application Support/vibe/app_config.json',
	dictationShortcut: 'Alt+Space',
	serverBinary: '/Applications/vibe.app/Contents/MacOS/server',
	vibeBinary: '/Applications/vibe.app/Contents/MacOS/vibe',
}

describe('composeSkill', () => {
	// A refactor that drops a section is invisible until an agent is missing half its instructions.
	it('keeps every part an agent needs', () => {
		const skill = composeSkill(context)
		expect(skill).toContain('# Server Local Transcription API')
		expect(skill).toContain(context.baseUrl)
		expect(skill).toContain(context.transcriptsFolder!)
		expect(skill).toContain(context.configPath!)
		expect(skill).toContain('transcript.vibe.json')
		expect(skill).toContain('"dictation.shortcut": "Alt+Space"')
		expect(skill).toContain('# When invoked without a task')
	})

	// The port is per-run: an agent that cannot find the live one, or the offline route, is stuck.
	it('routes around the dynamic port', () => {
		const skill = composeSkill(context)
		expect(skill).toContain(CONFIG_KEYS.apiBaseUrl)
		expect(skill).toContain('/health')
		expect(skill).toContain(context.serverBinary!)
		expect(skill).toContain(context.vibeBinary!)
	})

	it('still names both transcript layouts when the folder cannot be resolved', () => {
		const skill = composeSkill({ ...context, transcriptsFolder: null, configPath: null, serverBinary: null, vibeBinary: null })
		expect(skill).toContain('$HOME/Documents/Vibe')
		expect(skill).toContain('Settings → API & Agents → Config file')
		expect(skill).toContain('bundles the `server` engine')
	})
})

describe('withFrontmatter', () => {
	it('opens with the frontmatter the agent runtimes index by', () => {
		expect(withFrontmatter(composeSkill(context)).split('\n').slice(0, 4)).toEqual(['---', 'name: vibe', expect.stringContaining('description:'), '---'])
	})
})
