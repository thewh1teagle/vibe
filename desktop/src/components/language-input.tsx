import { subDays, isAfter } from 'date-fns'
import { Globe } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getI18nLanguageName, getLocalizedLanguageName } from '~/lib/i18n'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '~/components/ui/select'

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

	const capabilities = preference.modelMetadata?.capabilities
	const displayNames = new Intl.DisplayNames([preference.displayLanguage], { type: 'language' })
	const entries = (capabilities?.languages ?? []).map((code) => ({ label: displayNames.of(code) ?? code, name: code, code }))
	if (capabilities?.language_detection) entries.push({ label: getLocalizedLanguageName('auto'), name: 'auto', code: 'auto' })

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
	const popularLanguages = [getI18nLanguageName(), 'auto', 'english']
	const recentCodes = new Set(preference.recentLanguages.filter((r) => isAfter(r.ts, cutoff)).map((r) => r.code))
	const recentEntries: { label: string; code: string }[] = []
	const popularEntries: { label: string; code: string }[] = []
	const otherEntries: { label: string; code: string }[] = []

	entries.forEach(({ label, name, code }) => {
		if (recentCodes.has(code)) {
			recentEntries.push({ label, code })
		} else if (popularLanguages.includes(name)) {
			popularEntries.push({ label, code })
		} else {
			otherEntries.push({ label, code })
		}
	})

	// Sort recent entries by recency order
	const recentOrder = preference.recentLanguages.map((r) => r.code)
	recentEntries.sort((a, b) => recentOrder.indexOf(a.code) - recentOrder.indexOf(b.code))

	const prominent = variant === 'prominent'
	const selected = entries.find(({ code }) => code === preference.modelOptions.lang)

	return (
		<div className={cn('w-full', prominent ? '' : 'space-y-2')}>
			{prominent ? null : <Label>{m.language()}</Label>}
			<Select value={preference.modelOptions.lang} onValueChange={onValueChange}>
				<SelectTrigger
					aria-label={m.language()}
					className={cn(
						prominent &&
							'h-9 w-auto gap-2 rounded-full border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-none transition-colors hover:bg-muted/60 [&>span]:line-clamp-none [&>span]:flex [&>span]:items-center',
					)}>
					{prominent ? (
						<span className="flex min-w-0 items-center gap-2">
							<Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{selected ? stripDecoration(selected.label) : m.selectLanguage()}</span>
						</span>
					) : (
						<SelectValue placeholder={m.language()} />
					)}
				</SelectTrigger>
				<SelectContent>
					{recentEntries.length > 0 && (
						<SelectGroup>
							<SelectLabel>{m.recentlyUsed()}</SelectLabel>
							{recentEntries.map(({ label, code }) => (
								<SelectItem key={code} value={code}>
									{label}
								</SelectItem>
							))}
						</SelectGroup>
					)}
					<SelectGroup>
						<SelectLabel>{m.popular()}</SelectLabel>
						{popularEntries.map(({ label, code }) => (
							<SelectItem key={code} value={code}>
								{label}
							</SelectItem>
						))}
					</SelectGroup>
					<SelectGroup>
						<SelectLabel>{m.others()}</SelectLabel>
						{otherEntries.map(({ label, code }) => (
							<SelectItem key={code} value={code}>
								{label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	)
}
