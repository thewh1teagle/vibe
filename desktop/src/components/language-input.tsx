import { subDays, isAfter } from 'date-fns'
import { Globe } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getI18nLanguageName, getLocalizedLanguageName } from '~/lib/i18n'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '~/components/ui/select'

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

	const capabilities = preference.modelMetadata?.capabilities
	const displayNames = new Intl.DisplayNames([preference.displayLanguage], { type: 'language' })
	const entries = (capabilities?.languages ?? []).map((code) => ({ label: displayNames.of(code) ?? code, name: code, code }))
	const hasAutoDetect = capabilities?.language_detection ?? false

	entries.sort((a, b) => a.label.localeCompare(b.label))

	function onValueChange(value: string) {
		preference.setModelOptions({ ...preference.modelOptions, lang: value })
		if (value !== 'auto') {
			const now = Date.now()
			const recent = [{ code: value, ts: now }, ...preference.recentLanguages.filter((r) => r.code !== value)].slice(0, 5)
			preference.setRecentLanguages(recent)
		}
	}

	const cutoff = subDays(new Date(), 7)
	const popularLanguages = new Set(['english', 'en', 'hindi', 'hi', 'spanish', 'es', getI18nLanguageName()])
	const recentCodes = new Set(preference.recentLanguages.filter((r) => isAfter(r.ts, cutoff)).map((r) => r.code))
	const recentEntries: { label: string; name: string; code: string }[] = []
	const popularEntries: { label: string; name: string; code: string }[] = []
	const otherEntries: { label: string; name: string; code: string }[] = []

	entries.forEach((entry) => {
		if (recentCodes.has(entry.code)) {
			recentEntries.push(entry)
		} else if (popularLanguages.has(entry.name.toLowerCase())) {
			popularEntries.push(entry)
		} else {
			otherEntries.push(entry)
		}
	})

	// Sort recent entries by recency order
	const recentOrder = preference.recentLanguages.map((r) => r.code)
	recentEntries.sort((a, b) => recentOrder.indexOf(a.code) - recentOrder.indexOf(b.code))

	const prominent = variant === 'prominent'
	const selectedLang = preference.modelOptions.lang
	const selected = entries.find(({ code }) => code === selectedLang)
	const triggerLabel =
		selectedLang === 'auto' ? stripDecoration(getLocalizedLanguageName('auto')) : selected ? stripDecoration(selected.label) : m.selectLanguage()

	const groupLabelClass = 'text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase'

	function renderItem({ label, name, code }: { label: string; name: string; code: string }) {
		return (
			<SelectItem key={code} value={code}>
				<span className="flex items-center gap-2.5">
					<FlagSlot code={code} name={name} />
					{stripDecoration(label)}
				</span>
			</SelectItem>
		)
	}

	return (
		<div className={cn('w-full', prominent ? '' : 'space-y-2')}>
			{prominent ? null : <Label>{m.language()}</Label>}
			<Select value={selectedLang} onValueChange={onValueChange}>
				<SelectTrigger
					aria-label={m.language()}
					className={cn(
						prominent &&
							'h-9 w-auto gap-2 rounded-full border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-none transition-colors hover:bg-muted/60 [&>span]:line-clamp-none [&>span]:flex [&>span]:items-center',
					)}>
					{prominent ? (
						<span className="flex min-w-0 items-center gap-2">
							<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{triggerLabel}</span>
						</span>
					) : (
						<SelectValue placeholder={m.language()} />
					)}
				</SelectTrigger>
				<SelectContent className="min-w-[260px]">
					{/* Auto-detect is pinned at the top as its own choice, like a default. */}
					{hasAutoDetect && (
						<>
							<SelectItem value="auto">
								<span className="font-medium">{stripDecoration(getLocalizedLanguageName('auto'))}</span>
							</SelectItem>
							<SelectSeparator />
						</>
					)}
					{recentEntries.length > 0 && (
						<SelectGroup>
							<SelectLabel className={groupLabelClass}>{m.recentlyUsed()}</SelectLabel>
							{recentEntries.map(renderItem)}
						</SelectGroup>
					)}
					{popularEntries.length > 0 && (
						<SelectGroup>
							<SelectLabel className={groupLabelClass}>{m.popular()}</SelectLabel>
							{popularEntries.map(renderItem)}
						</SelectGroup>
					)}
					<SelectGroup>
						<SelectLabel className={groupLabelClass}>{m.others()}</SelectLabel>
						{otherEntries.map(renderItem)}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	)
}
