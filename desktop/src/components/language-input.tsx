import { subDays, isAfter } from 'date-fns'
import { useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { getI18nLanguageName, getLocalizedLanguageName } from '~/lib/i18n'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { Label } from '~/components/ui/label'
import { LanguageCombobox, matchesQuery, type LanguageGroup, type LanguageOption } from '~/components/language-combobox'

interface LanguageInputProps {
	/**
	 * `prominent` renders a compact, self-labelled control (globe + current language) meant to stand
	 * on its own in a toolbar row. `default` keeps the classic stacked label + full-width select.
	 */
	variant?: 'default' | 'prominent'
}

/** The `auto` message ships a sparkle; it reads gimmicky inside a permanent toolbar control. */
function stripDecoration(label: string) {
	return label.replace(/\s*[✨\u{1F300}-\u{1FAFF}]\s*$/u, '').trim()
}

export default function LanguageInput({ variant = 'default' }: LanguageInputProps) {
	const preference = usePreferenceProvider()
	const [query, setQuery] = useState('')

	const capabilities = preference.modelMetadata?.capabilities
	const hasAutoDetect = capabilities?.language_detection ?? false
	const selectedLang = preference.modelOptions.lang

	const entries = useMemo<LanguageOption[]>(() => {
		const displayNames = new Intl.DisplayNames([preference.displayLanguage], { type: 'language' })
		const englishNames = new Intl.DisplayNames(['en'], { type: 'language' })
		const of = (names: Intl.DisplayNames, code: string) => {
			try {
				return names.of(code) ?? code
			} catch {
				return code
			}
		}
		const list = (capabilities?.languages ?? []).map((code) => ({
			label: of(displayNames, code),
			keywords: [of(englishNames, code)],
			flagCode: code,
			flagName: of(englishNames, code),
			code,
		}))
		list.sort((a, b) => a.label.localeCompare(b.label))
		return list
	}, [capabilities, preference.displayLanguage])

	function select(code: string) {
		preference.setModelOptions({ ...preference.modelOptions, lang: code })
		if (code !== 'auto') {
			const now = Date.now()
			const recent = [{ code, ts: now }, ...preference.recentLanguages.filter((r) => r.code !== code)].slice(0, 5)
			preference.setRecentLanguages(recent)
		}
	}

	// Grouped view for browsing; a flat filtered list the moment the user types.
	const cutoff = subDays(new Date(), 7)
	const popularLanguages = new Set(['english', 'en', 'hindi', 'hi', 'spanish', 'es', getI18nLanguageName()])
	const recentCodes = new Set(preference.recentLanguages.filter((r) => isAfter(r.ts, cutoff)).map((r) => r.code))
	const needle = query.trim().toLowerCase()

	const autoEntry: LanguageOption | null = hasAutoDetect
		? { label: stripDecoration(getLocalizedLanguageName('auto')), keywords: ['auto detect'], code: 'auto', globe: true, emphasis: true }
		: null

	const groups = useMemo<LanguageGroup[]>(() => {
		if (needle) {
			const matches = entries.filter((entry) => matchesQuery(entry, needle))
			if (autoEntry && matchesQuery(autoEntry, needle)) matches.unshift(autoEntry)
			return [{ label: null, items: matches }]
		}
		const recent: LanguageOption[] = []
		const popular: LanguageOption[] = []
		const others: LanguageOption[] = []
		for (const entry of entries) {
			if (recentCodes.has(entry.code)) recent.push(entry)
			else if (popularLanguages.has(entry.code.toLowerCase())) popular.push(entry)
			else others.push(entry)
		}
		const recentOrder = preference.recentLanguages.map((r) => r.code)
		recent.sort((a, b) => recentOrder.indexOf(a.code) - recentOrder.indexOf(b.code))
		const result: LanguageGroup[] = []
		if (autoEntry) result.push({ label: null, items: [autoEntry] })
		if (recent.length) result.push({ label: m.recentlyUsed(), items: recent })
		if (popular.length) result.push({ label: m.popular(), items: popular })
		if (others.length) result.push({ label: m.others(), items: others })
		return result
	}, [entries, needle, preference.recentLanguages])

	const prominent = variant === 'prominent'
	const selected = entries.find(({ code }) => code === selectedLang)
	const triggerLabel = selectedLang === 'auto' && autoEntry ? autoEntry.label : selected ? stripDecoration(selected.label) : m.selectLanguage()

	return (
		<div className={cn('w-full', prominent ? '' : 'space-y-2')}>
			{prominent ? null : <Label>{m.language()}</Label>}
			<LanguageCombobox
				variant={variant}
				value={selectedLang}
				onSelect={select}
				groups={groups}
				query={query}
				onQueryChange={setQuery}
				triggerLabel={triggerLabel}
				ariaLabel={m.language()}
			/>
		</div>
	)
}
