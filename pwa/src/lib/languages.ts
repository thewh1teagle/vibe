/**
 * Language *display*, not language *knowledge*.
 *
 * The set of supported languages belongs to the desktop — it depends on the
 * model the user has loaded, so the phone asks for it (`op: "capabilities"`)
 * and never carries a table of its own. What the phone does own is turning the
 * raw whisper codes the desktop sends into names a human can read, which
 * `Intl.DisplayNames` does in the browser's own locale for free.
 */

/** Sentinel for the Radix select, which cannot hold an empty-string value. */
export const AUTO_LANG = 'auto'

let displayNames: Intl.DisplayNames | null | undefined

function getDisplayNames(): Intl.DisplayNames | null {
	if (displayNames === undefined) {
		try {
			displayNames = new Intl.DisplayNames(navigator.languages ?? [navigator.language], {
				type: 'language',
				fallback: 'none',
			})
		} catch {
			displayNames = null
		}
	}
	return displayNames
}

/** Human-readable name for a whisper language code, falling back to the code itself. */
export function languageLabel(code: string): string {
	const names = getDisplayNames()
	if (names) {
		try {
			const label = names.of(code)
			if (label) return label[0].toUpperCase() + label.slice(1)
		} catch {
			/* malformed code — fall through */
		}
	}
	return code
}

let englishNames: Intl.DisplayNames | null | undefined

/**
 * English name for a code, used as a search keyword alongside the localized
 * label so someone typing "german" still finds "Deutsch" — the same trick the
 * desktop picker uses.
 */
export function englishLanguageLabel(code: string): string {
	if (englishNames === undefined) {
		try {
			englishNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
		} catch {
			englishNames = null
		}
	}
	if (englishNames) {
		try {
			const label = englishNames.of(code)
			if (label) return label
		} catch {
			/* malformed code */
		}
	}
	return code
}

/* ------------------------------------------------------------ recent list */

const RECENT_KEY = 'vibe.handoff.recentLangs'
const RECENT_MAX = 5

/**
 * Recently-picked codes, most recent first. Stored as a plain ordered list, so
 * the "recent" group needs no timestamps and therefore no date library.
 */
export function loadRecentLanguages(): string[] {
	try {
		const raw = localStorage.getItem(RECENT_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (Array.isArray(parsed)) return parsed.filter((code): code is string => typeof code === 'string').slice(0, RECENT_MAX)
	} catch {
		/* corrupt or unavailable storage */
	}
	return []
}

/** Move `code` to the front of the recent list and persist it. */
export function rememberLanguage(code: string): string[] {
	const next = [code, ...loadRecentLanguages().filter((entry) => entry !== code)].slice(0, RECENT_MAX)
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(next))
	} catch {
		/* private mode */
	}
	return next
}
