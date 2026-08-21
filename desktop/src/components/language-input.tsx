import { subDays, isAfter } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Globe, Search } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getI18nLanguageName, getLocalizedLanguageName } from '~/lib/i18n'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { Label } from '~/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'

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

// Whisper reports languages either as ISO codes or as lowercase English names — key both.
const FLAGS: Record<string, string> = {
	en: '🇺🇸',
	english: '🇺🇸',
	es: '🇪🇸',
	spanish: '🇪🇸',
	hi: '🇮🇳',
	hindi: '🇮🇳',
	fr: '🇫🇷',
	french: '🇫🇷',
	de: '🇩🇪',
	german: '🇩🇪',
	it: '🇮🇹',
	italian: '🇮🇹',
	pt: '🇧🇷',
	portuguese: '🇧🇷',
	ru: '🇷🇺',
	russian: '🇷🇺',
	ja: '🇯🇵',
	japanese: '🇯🇵',
	ko: '🇰🇷',
	korean: '🇰🇷',
	zh: '🇨🇳',
	chinese: '🇨🇳',
	ar: '🇸🇦',
	arabic: '🇸🇦',
	he: '🇮🇱',
	iw: '🇮🇱',
	hebrew: '🇮🇱',
	tr: '🇹🇷',
	turkish: '🇹🇷',
	nl: '🇳🇱',
	dutch: '🇳🇱',
	pl: '🇵🇱',
	polish: '🇵🇱',
	uk: '🇺🇦',
	ukrainian: '🇺🇦',
	sv: '🇸🇪',
	swedish: '🇸🇪',
	no: '🇳🇴',
	nb: '🇳🇴',
	norwegian: '🇳🇴',
	da: '🇩🇰',
	danish: '🇩🇰',
	fi: '🇫🇮',
	finnish: '🇫🇮',
	cs: '🇨🇿',
	czech: '🇨🇿',
	sk: '🇸🇰',
	slovak: '🇸🇰',
	hu: '🇭🇺',
	hungarian: '🇭🇺',
	ro: '🇷🇴',
	romanian: '🇷🇴',
	bg: '🇧🇬',
	bulgarian: '🇧🇬',
	hr: '🇭🇷',
	croatian: '🇭🇷',
	sr: '🇷🇸',
	serbian: '🇷🇸',
	sl: '🇸🇮',
	slovenian: '🇸🇮',
	el: '🇬🇷',
	greek: '🇬🇷',
	id: '🇮🇩',
	indonesian: '🇮🇩',
	ms: '🇲🇾',
	malay: '🇲🇾',
	vi: '🇻🇳',
	vietnamese: '🇻🇳',
	th: '🇹🇭',
	thai: '🇹🇭',
	fa: '🇮🇷',
	persian: '🇮🇷',
	ur: '🇵🇰',
	urdu: '🇵🇰',
	bn: '🇧🇩',
	bengali: '🇧🇩',
	ta: '🇮🇳',
	tamil: '🇮🇳',
	te: '🇮🇳',
	telugu: '🇮🇳',
	mr: '🇮🇳',
	marathi: '🇮🇳',
	kn: '🇮🇳',
	kannada: '🇮🇳',
	ml: '🇮🇳',
	malayalam: '🇮🇳',
	pa: '🇮🇳',
	punjabi: '🇮🇳',
	gu: '🇮🇳',
	gujarati: '🇮🇳',
	az: '🇦🇿',
	azerbaijani: '🇦🇿',
	kk: '🇰🇿',
	kazakh: '🇰🇿',
	uz: '🇺🇿',
	uzbek: '🇺🇿',
	ka: '🇬🇪',
	georgian: '🇬🇪',
	hy: '🇦🇲',
	armenian: '🇦🇲',
	et: '🇪🇪',
	estonian: '🇪🇪',
	lv: '🇱🇻',
	latvian: '🇱🇻',
	lt: '🇱🇹',
	lithuanian: '🇱🇹',
	be: '🇧🇾',
	belarusian: '🇧🇾',
	mk: '🇲🇰',
	macedonian: '🇲🇰',
	sq: '🇦🇱',
	albanian: '🇦🇱',
	bs: '🇧🇦',
	bosnian: '🇧🇦',
	is: '🇮🇸',
	icelandic: '🇮🇸',
	mt: '🇲🇹',
	maltese: '🇲🇹',
	sw: '🇰🇪',
	swahili: '🇰🇪',
	af: '🇿🇦',
	afrikaans: '🇿🇦',
	am: '🇪🇹',
	amharic: '🇪🇹',
	ne: '🇳🇵',
	nepali: '🇳🇵',
	si: '🇱🇰',
	sinhala: '🇱🇰',
	my: '🇲🇲',
	myanmar: '🇲🇲',
	burmese: '🇲🇲',
	km: '🇰🇭',
	khmer: '🇰🇭',
	lo: '🇱🇦',
	lao: '🇱🇦',
	mn: '🇲🇳',
	mongolian: '🇲🇳',
	tl: '🇵🇭',
	tagalog: '🇵🇭',
	filipino: '🇵🇭',
	ca: '🇦🇩',
	catalan: '🇦🇩',
	gl: '🇪🇸',
	galician: '🇪🇸',
	eu: '🇪🇸',
	basque: '🇪🇸',
	cy: '🇬🇧',
	welsh: '🇬🇧',
	ga: '🇮🇪',
	irish: '🇮🇪',
	yi: '🇮🇱',
	yiddish: '🇮🇱',
}

function flagFor(code: string, name: string): string | null {
	return FLAGS[code.toLowerCase()] ?? FLAGS[name.toLowerCase()] ?? null
}

function FlagSlot({ code, name }: { code: string; name: string }) {
	const flag = flagFor(code, name)
	return (
		<span aria-hidden className="inline-flex w-6 shrink-0 justify-center text-[15px] leading-none">
			{flag ?? <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
		</span>
	)
}

export default function LanguageInput({ variant = 'default' }: LanguageInputProps) {
	const preference = usePreferenceProvider()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [highlighted, setHighlighted] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const capabilities = preference.modelMetadata?.capabilities
	const hasAutoDetect = capabilities?.language_detection ?? false
	const selectedLang = preference.modelOptions.lang

	const entries = useMemo(() => {
		const displayNames = new Intl.DisplayNames([preference.displayLanguage], { type: 'language' })
		const list = (capabilities?.languages ?? []).map((code) => ({ label: displayNames.of(code) ?? code, name: code, code }))
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
		setOpen(false)
	}

	// Grouped view for browsing; a flat filtered list the moment the user types.
	const cutoff = subDays(new Date(), 7)
	const popularLanguages = new Set(['english', 'en', 'hindi', 'hi', 'spanish', 'es', getI18nLanguageName()])
	const recentCodes = new Set(preference.recentLanguages.filter((r) => isAfter(r.ts, cutoff)).map((r) => r.code))
	const needle = query.trim().toLowerCase()

	type Entry = { label: string; name: string; code: string }
	const autoEntry: Entry | null = hasAutoDetect ? { label: stripDecoration(getLocalizedLanguageName('auto')), name: 'auto', code: 'auto' } : null

	const groups = useMemo(() => {
		if (needle) {
			const matches = entries.filter((entry) => entry.label.toLowerCase().includes(needle) || entry.code.toLowerCase().includes(needle))
			if (autoEntry && autoEntry.label.toLowerCase().includes(needle)) matches.unshift(autoEntry)
			return [{ label: null as string | null, items: matches }]
		}
		const recent: Entry[] = []
		const popular: Entry[] = []
		const others: Entry[] = []
		for (const entry of entries) {
			if (recentCodes.has(entry.code)) recent.push(entry)
			else if (popularLanguages.has(entry.name.toLowerCase())) popular.push(entry)
			else others.push(entry)
		}
		const recentOrder = preference.recentLanguages.map((r) => r.code)
		recent.sort((a, b) => recentOrder.indexOf(a.code) - recentOrder.indexOf(b.code))
		const result: { label: string | null; items: Entry[] }[] = []
		if (autoEntry) result.push({ label: null, items: [autoEntry] })
		if (recent.length) result.push({ label: m.recentlyUsed(), items: recent })
		if (popular.length) result.push({ label: m.popular(), items: popular })
		if (others.length) result.push({ label: m.others(), items: others })
		return result
	}, [entries, needle, preference.recentLanguages])

	const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

	useEffect(() => {
		setHighlighted(0)
	}, [needle, open])

	useEffect(() => {
		if (!open) setQuery('')
	}, [open])

	function onInputKeyDown(event: React.KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setHighlighted((index) => Math.min(index + 1, flat.length - 1))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setHighlighted((index) => Math.max(index - 1, 0))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const pick = flat[highlighted] ?? flat[0]
			if (pick) select(pick.code)
		} else if (event.key === 'Escape') {
			setOpen(false)
		}
	}

	// Keep the highlighted row in view while arrowing through the list.
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' })
	}, [highlighted])

	const prominent = variant === 'prominent'
	const selected = entries.find(({ code }) => code === selectedLang)
	const triggerLabel = selectedLang === 'auto' && autoEntry ? autoEntry.label : selected ? stripDecoration(selected.label) : m.selectLanguage()

	let runningIndex = -1

	return (
		<div className={cn('w-full', prominent ? '' : 'space-y-2')}>
			{prominent ? null : <Label>{m.language()}</Label>}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={m.language()}
						aria-expanded={open}
						className={cn(
							'flex cursor-pointer items-center gap-2 border border-border text-start transition-colors duration-150',
							prominent
								? 'h-9 rounded-full bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted/60'
								: 'h-9 w-full rounded-lg bg-transparent px-3 text-sm text-foreground',
						)}>
						<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[280px] rounded-2xl p-0">
					<div className="flex items-center gap-2 border-b border-border px-3">
						<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<input
							ref={inputRef}
							autoFocus
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={onInputKeyDown}
							placeholder={m.selectLanguage()}
							aria-label={m.language()}
							className="h-10 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
						/>
					</div>
					<div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
						{flat.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matches</p>}
						{groups.map((group, groupIndex) => (
							<div key={group.label ?? `group-${groupIndex}`}>
								{group.label && (
									<p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
										{group.label}
									</p>
								)}
								{group.items.map((entry) => {
									runningIndex += 1
									const index = runningIndex
									const active = entry.code === selectedLang
									return (
										<button
											key={entry.code}
											type="button"
											data-index={index}
											onClick={() => select(entry.code)}
											onMouseMove={() => setHighlighted(index)}
											className={cn(
												'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-foreground',
												index === highlighted && 'bg-muted/70',
												entry.code === 'auto' && 'font-medium',
											)}>
											{entry.code === 'auto' ? (
												<span aria-hidden className="inline-flex w-6 shrink-0 justify-center">
													<Globe className="h-3.5 w-3.5 text-muted-foreground" />
												</span>
											) : (
												<FlagSlot code={entry.code} name={entry.name} />
											)}
											<span className="min-w-0 flex-1 truncate">{entry.label}</span>
											{active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
										</button>
									)
								})}
							</div>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}
