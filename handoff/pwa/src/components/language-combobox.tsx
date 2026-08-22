// Ported from `desktop/src/components/language-combobox.tsx` so the phone and the
// main window stay visually identical. Differences are phone-specific only:
// larger touch targets, a viewport-bounded popover, and no autofocus on the
// search field (autofocusing pops the on-screen keyboard the instant the picker
// opens, hiding the very list the user came to browse).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { cn } from '~/lib/style'
import { Popover, PopoverAnchor, PopoverContent } from '~/components/ui/popover'

export interface LanguageOption {
	/** Value handed back to `onSelect`. */
	code: string
	/** Text shown in the row and, when selected, on the trigger. */
	label: string
	/** Extra needles the search matches against (english name, iso code, ...). */
	keywords?: string[]
	/** Key used to look up the flag; falls back to `code`. */
	flagCode?: string
	/** Secondary flag key, usually the lowercase english name. */
	flagName?: string
	/** Show a globe instead of a flag (used by "auto detect"). */
	globe?: boolean
	/** Render the row a touch heavier (used by "auto detect"). */
	emphasis?: boolean
}

export interface LanguageGroup {
	label: string | null
	items: LanguageOption[]
}

interface LanguageComboboxProps {
	/** Currently selected code; the matching row gets a checkmark. */
	value: string
	onSelect: (code: string) => void
	/** Groups to render. Callers filter by `query` themselves so they own the grouping rules. */
	groups: LanguageGroup[]
	query: string
	onQueryChange: (query: string) => void
	/** Text on the closed trigger, and the placeholder while typing. */
	triggerLabel: string
	ariaLabel: string
	emptyLabel?: string
	/**
	 * `prominent` renders the pill used in the toolbar; `default` is the plain full-width control.
	 */
	variant?: 'default' | 'prominent'
	/** Extra classes for the trigger (width overrides, mostly). */
	className?: string
	contentClassName?: string
	/** Capitalize labels that ship lowercase (the display-language registry does). */
	capitalize?: boolean
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

export function flagFor(code: string, name?: string): string | null {
	return FLAGS[code.toLowerCase()] ?? (name ? (FLAGS[name.toLowerCase()] ?? null) : null)
}

export function FlagSlot({ code, name }: { code: string; name?: string }) {
	const flag = flagFor(code, name)
	return (
		<span aria-hidden className="inline-flex w-6 shrink-0 justify-center text-[15px] leading-none">
			{flag ?? <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
		</span>
	)
}

/** Search-as-you-type language picker: the pill turns into the input while open. */
export function LanguageCombobox({
	value,
	onSelect,
	groups,
	query,
	onQueryChange,
	triggerLabel,
	ariaLabel,
	emptyLabel,
	variant = 'default',
	className,
	contentClassName,
	capitalize,
}: LanguageComboboxProps) {
	const [open, setOpen] = useState(false)
	const [highlighted, setHighlighted] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

	useEffect(() => {
		setHighlighted(0)
	}, [query, open])

	useEffect(() => {
		if (!open) onQueryChange('')
	}, [open])

	// Keep the highlighted row in view while arrowing through the list.
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' })
	}, [highlighted])

	function pick(code: string) {
		onSelect(code)
		setOpen(false)
	}

	function onInputKeyDown(event: React.KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setHighlighted((index) => Math.min(index + 1, flat.length - 1))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setHighlighted((index) => Math.max(index - 1, 0))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const chosen = flat[highlighted] ?? flat[0]
			if (chosen) pick(chosen.code)
		} else if (event.key === 'Escape') {
			setOpen(false)
		}
	}

	const prominent = variant === 'prominent'
	let runningIndex = -1

	return (
		<Popover open={open} onOpenChange={setOpen}>
			{/* The pill itself becomes the input while open — same container, same shape. */}
			<PopoverAnchor asChild>
				<div
					onClick={() => {
						if (!open) setOpen(true)
					}}
					className={cn(
						'flex items-center gap-2 border text-start transition-colors duration-150',
						prominent ? 'h-12 w-[200px] rounded-full bg-card px-4 text-sm font-medium' : 'h-12 w-full rounded-xl bg-transparent px-4 text-base',
						open ? 'border-ring/60' : 'cursor-pointer border-border hover:bg-muted/60',
						className,
					)}>
					<Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
					{open ? (
						<input
							ref={inputRef}
							autoComplete="off"
							autoCorrect="off"
							autoCapitalize="none"
							spellCheck={false}
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							onKeyDown={onInputKeyDown}
							placeholder={triggerLabel}
							aria-label={ariaLabel}
							className={cn(
								'w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted-foreground',
								capitalize && 'placeholder:capitalize',
							)}
						/>
					) : (
						<button
							type="button"
							aria-label={ariaLabel}
							aria-expanded={open}
							className={cn('min-w-0 flex-1 cursor-pointer truncate text-start text-inherit outline-none', capitalize && 'capitalize')}>
							{triggerLabel}
						</button>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				collisionPadding={12}
				avoidCollisions
				onOpenAutoFocus={(event) => event.preventDefault()}
				className={cn(
					'rounded-2xl p-0',
					prominent ? 'w-[240px]' : 'w-[var(--radix-popper-anchor-width)] min-w-[240px] max-w-[calc(100vw-24px)]',
					contentClassName
				)}>
				<div ref={listRef} className="max-h-[min(60dvh,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-1.5">
					{flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel ?? 'No matches'}</p>}
					{groups.map((group, groupIndex) => (
						<div key={group.label ?? `group-${groupIndex}`}>
							{group.label && (
								<p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{group.label}</p>
							)}
							{group.items.map((entry) => {
								runningIndex += 1
								const index = runningIndex
								const active = entry.code === value
								return (
									<button
										key={entry.code}
										type="button"
										data-index={index}
										onClick={() => pick(entry.code)}
										onMouseMove={() => setHighlighted(index)}
										className={cn(
											'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-start text-base text-foreground',
											index === highlighted && 'bg-muted/70',
											entry.emphasis && 'font-medium',
										)}>
										{entry.globe ? (
											<span aria-hidden className="inline-flex w-6 shrink-0 justify-center">
												<Globe className="h-3.5 w-3.5 text-muted-foreground" />
											</span>
										) : (
											<FlagSlot code={entry.flagCode ?? entry.code} name={entry.flagName} />
										)}
										<span className={cn('min-w-0 flex-1 truncate', capitalize && 'capitalize')}>{entry.label}</span>
										{active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
									</button>
								)
							})}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

/** Does an option match what the user typed? */
export function matchesQuery(option: LanguageOption, needle: string) {
	if (!needle) return true
	const haystack = [option.label, option.code, ...(option.keywords ?? [])]
	return haystack.some((text) => text.toLowerCase().includes(needle))
}
