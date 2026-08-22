import { useMemo, useState } from 'react'

import { LanguageCombobox, matchesQuery, type LanguageGroup, type LanguageOption } from '~/components/language-combobox'
import { AUTO_LANG, englishLanguageLabel, languageLabel, loadRecentLanguages, rememberLanguage } from '~/lib/languages'
import type { Capabilities } from '~/lib/handoff'

interface Props {
	capabilities: Capabilities | null
	/** `''` means auto-detect; the combobox uses the `auto` sentinel internally. */
	value: string
	onChange: (lang: string) => void
}

/**
 * Adapted from `desktop/src/components/language-input.tsx`: same control, same
 * grouping shape, sourced from the same data. The desktop reads
 * `capabilities.language_detection` off the model metadata; the phone reads
 * `languageDetection` off the capabilities reply — the same fact, one relay hop
 * away. Nothing here knows any language the desktop did not send.
 */
export function LanguagePicker({ capabilities, value, onChange }: Props) {
	const [query, setQuery] = useState('')
	const [recent, setRecent] = useState<string[]>(() => loadRecentLanguages())

	const hasAutoDetect = capabilities?.languageDetection ?? false
	const selected = value || (hasAutoDetect ? AUTO_LANG : '')

	// Localized label for display, English name as an extra search needle — so
	// typing "german" finds "Deutsch", exactly as the desktop intends.
	const entries = useMemo<LanguageOption[]>(() => {
		const list = (capabilities?.languages ?? []).map((code) => {
			const english = englishLanguageLabel(code)
			return { code, label: languageLabel(code), keywords: [english], flagCode: code, flagName: english }
		})
		list.sort((a, b) => a.label.localeCompare(b.label))
		return list
	}, [capabilities])

	const autoEntry: LanguageOption | null = hasAutoDetect
		? { code: AUTO_LANG, label: 'Auto-detect', keywords: ['auto detect', 'automatic'], globe: true, emphasis: true }
		: null

	const needle = query.trim().toLowerCase()

	const groups = useMemo<LanguageGroup[]>(() => {
		if (needle) {
			const matches = entries.filter((entry) => matchesQuery(entry, needle))
			if (autoEntry && matchesQuery(autoEntry, needle)) matches.unshift(autoEntry)
			return [{ label: null, items: matches }]
		}

		// "Popular" on the desktop is a fixed shortlist. On a phone the device
		// already knows which languages this person uses, so ask it instead of
		// inventing a list.
		const deviceCodes = new Set(
			(navigator.languages ?? [navigator.language])
				.map((tag) => tag.split('-')[0]?.toLowerCase())
				.filter((code): code is string => !!code)
		)
		const recentSet = new Set(recent)

		const recentItems: LanguageOption[] = []
		const deviceItems: LanguageOption[] = []
		const others: LanguageOption[] = []
		for (const entry of entries) {
			if (recentSet.has(entry.code)) recentItems.push(entry)
			else if (deviceCodes.has(entry.code.toLowerCase())) deviceItems.push(entry)
			else others.push(entry)
		}
		recentItems.sort((a, b) => recent.indexOf(a.code) - recent.indexOf(b.code))

		const result: LanguageGroup[] = []
		if (autoEntry) result.push({ label: null, items: [autoEntry] })
		if (recentItems.length) result.push({ label: 'Recently used', items: recentItems })
		if (deviceItems.length) result.push({ label: 'On this device', items: deviceItems })
		if (others.length) result.push({ label: 'Others', items: others })
		return result
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entries, needle, recent, hasAutoDetect])

	function select(code: string) {
		if (code === AUTO_LANG) {
			onChange('')
			return
		}
		onChange(code)
		setRecent(rememberLanguage(code))
	}

	const current = entries.find((entry) => entry.code === selected)
	const triggerLabel = selected === AUTO_LANG && autoEntry ? autoEntry.label : (current?.label ?? 'Choose a language')

	return (
		<LanguageCombobox
			value={selected}
			onSelect={select}
			groups={groups}
			query={query}
			onQueryChange={setQuery}
			triggerLabel={triggerLabel}
			ariaLabel="Language"
		/>
	)
}
