import { invoke } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import * as config from './config'
import { CONFIG_KEYS } from './config-keys'
import { transcriptsFolder } from './transcripts-store'

/** Executables an agent can drive, as resolved by `cmd::skill::get_agent_paths`. */
interface AgentPaths {
	sona: string | null
	vibe: string | null
}

/**
 * The Vibe agent skill.
 *
 * Sona's `/skill` endpoint documents the transcription API and nothing else. An agent working on
 * someone's behalf also needs to know where the saved transcripts are, where the settings file is,
 * and what to do when it is invoked with no instructions — so those sections live here and are
 * appended to whatever the runner serves.
 *
 * The same text is both copied to the clipboard and written to disk as `SKILL.md` (with the YAML
 * frontmatter the agent runtimes index a skill folder by). Composition is a pure function of
 * {@link SkillContext} so it can be read and tested as a document; every platform lookup happens
 * inside {@link skillContext}, never at module scope, so importing this file never touches `window`.
 */

/** Agent runtimes we can install the skill for. Must match `cmd::skill::runtime_folder` in Rust. */
export type SkillTarget = 'claude' | 'codex'

/** Starter line for a freshly installed skill — short enough to paste into any terminal. */
export const STARTER_PROMPT = 'claude "summarize my latest Vibe transcript"'

export interface SkillContext {
	/** Base URL of the running local API, baked in at write time. */
	baseUrl: string
	/** Body served by the runner's `/skill`, already trimmed. */
	sonaSkill: string
	/** Absolute transcripts folder, or null when it cannot be resolved. */
	transcriptsFolder: string | null
	/** Absolute path of `app_config.json`, or null when it cannot be resolved. */
	configPath: string | null
	/** Default dictation shortcut on this platform, used as the settings example. */
	dictationShortcut: string
	/** Absolute path of the bundled `sona` binary, or null when it cannot be resolved. */
	sonaBinary: string | null
	/** Absolute path of the Vibe executable, or null when it cannot be resolved. */
	vibeBinary: string | null
}

/**
 * The port is picked per run, so a baked-in base URL goes stale as soon as Vibe restarts, and the
 * API server is off by default. Point at the config key that holds the live one, insist on a health
 * check before trusting it, and make clear that most work needs no server at all.
 */
function baseUrlSection(context: SkillContext) {
	return [
		'## The base URL changes every run',
		'',
		`\`${context.baseUrl}\` was correct when this skill was installed. Vibe binds a free port on every`,
		'run, and the API server is a toggle that is off by default, so do not assume it still answers.',
		'',
		`While the server runs, Vibe writes the current base URL into \`${CONFIG_KEYS.apiBaseUrl}\` in the config file`,
		'(path in the settings section below) and removes it on stop. Read it there rather than reusing',
		'the one above — but treat it as a hint: a crash can leave a dead value behind, so confirm with',
		'`GET <base>/health` before relying on it. No key, or no answer, means the server is off; ask the',
		'user to turn it on in Settings → API & Agents if you actually need it.',
		'',
		'Most requests do not. Summarising, pulling out action items and searching earlier transcripts all',
		'read files from the transcripts folder below — reach for the filesystem first. The API is only',
		'needed to transcribe new audio, and even that has a no-server route (next section).',
	].join('\n')
}

/** The bundled binaries: what an agent can actually run, and what it must ask before running. */
function commandLineSection(context: SkillContext) {
	return [
		'# Transcribing without the API',
		'',
		context.sonaBinary
			? ['Vibe bundles the `sona` engine as a standalone binary:', '', `  ${context.sonaBinary}`].join('\n')
			: 'Vibe bundles the `sona` engine as a standalone binary next to the Vibe executable.',
		'',
		'It transcribes straight from the command line — no server, no port, and no GUI running. Run it',
		'with `--help` for the current usage; the subcommands are `transcribe`, `serve`, `pull` and',
		'`devices`, and `transcribe` needs a local whisper.cpp ggml model (the one Vibe uses is under',
		'`model.path` in the config file).',
		'',
		context.vibeBinary
			? `The Vibe app itself is at \`${context.vibeBinary}\`. It takes no useful command line flags —`
			: 'The Vibe app itself takes no useful command line flags —',
		'`--help` prints nothing and exits 0, so never drive Vibe from the shell. If the user would be',
		'better off in the app, say so and let them open it: do not launch a GUI application on someone',
		"else's machine without asking first.",
	].join('\n')
}

/** Where saved transcripts live, what they look like, and how to pick the newest one. */
function transcriptsSection(context: SkillContext) {
	const folder = context.transcriptsFolder
	return [
		'# Vibe transcripts',
		'',
		'Everything the user saved from Vibe lives under one folder:',
		'',
		folder ? `  ${folder}` : "  <the user's documents folder>/Vibe",
		'',
		'Two layouts sit side by side in it:',
		'',
		'- **project folder** (new saves): `<name>-<yyyyMMdd-HHmmss>/` holding `transcript.vibe.json`',
		'  next to a copy of the audio it was transcribed from (`audio.<ext>`);',
		'- **flat file** (older saves): `<name>-<yyyyMMdd-HHmmss>.vibe.json` directly in the folder.',
		'',
		'Both hold the same record:',
		'',
		'~~~json',
		'{',
		'  "version": 1,',
		'  "name": "team-standup",',
		'  "sourcePath": "/path/to/the/original/media.mp3",',
		'  "createdAt": "2026-08-20T09:30:15.000Z",',
		'  "language": "english",',
		'  "modelPath": "/path/to/ggml-medium.bin",',
		'  "audioFile": "audio.mp3",',
		'  "segments": [{ "start": 0, "stop": 2400, "text": "Quick recap of yesterday." }],',
		'  "summary": "optional — the last AI summary made in Vibe"',
		'}',
		'~~~',
		'',
		'`start`/`stop` are milliseconds from the start of the audio, `segments[].speaker` is an optional',
		'speaker number, and `audioFile` is relative to the project folder (project saves only).',
		'',
		'## Finding the latest transcript',
		'',
		'"Newest file in the folder" is wrong here: a project save\'s record is one level down, and mtimes',
		'change when files are copied or renamed. Sort on the `-yyyyMMdd-HHmmss` stamp of the *entry* name',
		'(local time, and lexicographically sortable) instead:',
		'',
		'1. list the direct children of the transcripts folder;',
		'2. for a directory, the record is `<directory>/transcript.vibe.json` — skip directories without',
		'   one; for a file, take it only if it ends in `.vibe.json`;',
		'3. sort by the stamp on the directory name, or on the file name minus `.vibe.json`, descending;',
		'   entries with no stamp are older imports and sort last;',
		'4. the first entry wins — `createdAt` inside the record confirms it.',
		'',
		'~~~sh',
		`folder="${folder ?? '$HOME/Documents/Vibe'}"`,
		'for entry in "$folder"/*; do',
		'  record="$entry"; [ -d "$entry" ] && record="$entry/transcript.vibe.json"',
		'  case "$record" in *.vibe.json) ;; *) continue ;; esac',
		'  [ -f "$record" ] || continue',
		'  stamp=$(basename "$entry" .vibe.json | grep -oE "[0-9]{8}-[0-9]{6}$")',
		'  printf "%s\\t%s\\n" "${stamp:-00000000-000000}" "$record"',
		'done | sort | tail -1 | cut -f2',
		'~~~',
	].join('\n')
}

/** What to do when the user invokes the skill without saying what they want. */
function behaviourSection() {
	return [
		'# When invoked without a task',
		'',
		'Read the latest transcript first, then say which one it is (file name and date, so the user can',
		'redirect you if it is not the one they meant) and offer a few concrete next steps drawn from what',
		'it actually contains — a meeting where several people commit to things suggests action items with',
		'owners; a solo dictation suggests cleaning it up into prose or summarising it; an interview',
		'suggests key quotes and themes. Look before you offer, and keep the offer short.',
		'',
		'Worth offering, when the transcript supports it: action items with owners and deadlines, a short',
		'summary, decisions made, open questions, a draft follow-up email.',
		'',
		'Match the length to the transcript — a two-minute note does not get a report. Offer rather than',
		'assume, and confirm before writing any file. You read transcripts from disk and call the local',
		"API; anything else (sending mail, changing a calendar) is only possible if the user's own agent",
		'has those tools, so offer to *draft* it, not to send it.',
	].join('\n')
}

/** Where the settings live and how to change them without corrupting the file. */
function settingsSection(context: SkillContext) {
	return [
		'# Vibe settings',
		'',
		'Vibe keeps every setting in one JSON file, safe to read and edit:',
		'',
		context.configPath ? `  ${context.configPath}` : '  (ask the user to open Settings → API & Agents → Config file)',
		'',
		'Keys are flat and named after the setting they control, for example:',
		'',
		'~~~json',
		'{',
		'  "general.theme": "dark",',
		'  "general.displayLanguage": "en-US",',
		'  "transcription.recognizeSpeakers": false,',
		'  "transcription.modelOptions": { "lang": "en", "n_threads": 4 },',
		`  "dictation.shortcut": "${context.dictationShortcut}"`,
		'}',
		'~~~',
		'',
		'Vibe watches the file, so an edit applies immediately — no restart, and no need to ask the',
		'user to reopen the app. Write the whole file atomically (write a temporary file beside it,',
		'then rename it over the original) so Vibe can never read a half-written config.',
		'',
		`Source and docs: ${config.repoURL}`,
	].join('\n')
}

/** The whole skill as one markdown document. Pure: everything it needs is in `context`. */
export function composeSkill(context: SkillContext) {
	return [
		context.sonaSkill.trimEnd(),
		baseUrlSection(context),
		commandLineSection(context),
		transcriptsSection(context),
		settingsSection(context),
		behaviourSection(),
	].join('\n\n')
}

/** Both runtimes index a skill folder by this frontmatter; the clipboard copy has no use for it. */
export function withFrontmatter(body: string) {
	return [
		'---',
		'name: vibe',
		'description: Work with Vibe — read saved transcripts, transcribe audio through the local Vibe API, and read or change Vibe settings.',
		'---',
		'',
		body,
	].join('\n')
}

/** Gather everything the document needs. Throws only when the local API is unreachable. */
async function skillContext(baseUrl: string): Promise<SkillContext> {
	const response = await tauriFetch(`${baseUrl}/skill`)
	const paths = await invoke<AgentPaths>('get_agent_paths').catch(() => ({ sona: null, vibe: null }))
	return {
		baseUrl,
		sonaSkill: await response.text(),
		transcriptsFolder: await transcriptsFolder().catch(() => null),
		configPath: await invoke<string>('get_config_path').catch(() => null),
		dictationShortcut: config.getDefaultHotkeyShortcut(),
		sonaBinary: paths.sona,
		vibeBinary: paths.vibe,
	}
}

/** The skill as it is copied to the clipboard. */
export async function buildSkill(baseUrl: string) {
	return composeSkill(await skillContext(baseUrl))
}

/**
 * Write the skill to `<home>/.claude|.codex/skills/vibe/SKILL.md`, overwriting any earlier install
 * (a reinstall is how a stale base URL gets refreshed).
 * @returns the absolute path written.
 */
export async function installSkill(target: SkillTarget, baseUrl: string) {
	const contents = withFrontmatter(await buildSkill(baseUrl))
	return await invoke<string>('install_agent_skill', { target, contents })
}
