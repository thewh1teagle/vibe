import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig, writeConfig } from '~/lib/config-store'

/** The default every release before this one shipped; nobody chose it on purpose. */
const LEGACY_DEFAULT_TEMPERATURE = 0.4

/**
 * Whisper samples instead of running beam search whenever the starting temperature is above 0
 * (whisper-rs `full.rs`, as in whisper.cpp), so the old 0.4 default turned "beam search" into
 * five random candidates per window. On meetings that cost up to 9 WER points and let the text
 * drift into lowercase without punctuation a few minutes in. 0 keeps beam search and still
 * falls back to higher temperatures on a window that fails to decode.
 */
export function resetLegacyTemperature() {
	const options = readConfig<Record<string, unknown> | null>(CONFIG_KEYS.modelOptions, null)
	if (options?.temperature === LEGACY_DEFAULT_TEMPERATURE) {
		writeConfig(CONFIG_KEYS.modelOptions, { ...options, temperature: 0 })
	}
}
