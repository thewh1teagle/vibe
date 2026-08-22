import { useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { getLocalizedLanguageName, supportedLanguages } from '~/lib/i18n'
import { LanguageCombobox, matchesQuery, type LanguageGroup, type LanguageOption } from '~/components/language-combobox'

/** "spanish (ES)" → "spanish", so the flag map can find it. */
function baseName(name: string) {
	return name.replace(/\s*\([^)]*\)$/, '').trim()
}

/**
 * Picker for the app's own UI language. Same control as the transcription language selector —
 * globe pill, type-to-search, flags — over the locales we actually ship translations for.
 */
export function DisplayLanguageInput({ value, onSelect, className }: { value: string; onSelect: (code: string) => void; className?: string }) {
	const [query, setQuery] = useState('')
	const selected = supportedLanguages[value] ? value : 'en-US'

	const entries = useMemo<LanguageOption[]>(() => {
		// Each language is listed in its own words ("עברית", "Français") the way macOS does it,
		// with the english name kept as a search term.
		const endonym = (code: string) => {
			try {
				return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
			} catch {
				return code
			}
		}
		return Object.entries(supportedLanguages)
			.map(([code, name]) => ({
				code,
				label: code === getLocale() ? getLocalizedLanguageName(name) : endonym(code),
				keywords: [name, endonym(code), code.split('-')[0]],
				flagCode: code.split('-')[0],
				flagName: baseName(name),
			}))
			.sort((a, b) => a.label.localeCompare(b.label))
	}, [])

	const needle = query.trim().toLowerCase()
	const groups = useMemo<LanguageGroup[]>(() => [{ label: null, items: entries.filter((entry) => matchesQuery(entry, needle)) }], [entries, needle])

	const triggerLabel = entries.find((entry) => entry.code === selected)?.label ?? m.selectLanguage()

	return (
		<LanguageCombobox
			className={className}
			value={selected}
			onSelect={onSelect}
			groups={groups}
			query={query}
			onQueryChange={setQuery}
			triggerLabel={triggerLabel}
			ariaLabel={m.language()}
		/>
	)
}
