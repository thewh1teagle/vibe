
import { subDays, isAfter } from 'date-fns'
import { m } from '~/paraglide/messages.js'
import { getI18nLanguageName, getLocalizedLanguageName } from '~/lib/i18n'
import { usePreferenceProvider } from '~/providers/preference'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '~/components/ui/select'

export default function LanguageInput() {
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

	return (
		<div className="space-y-2 w-full">
			<Label>{m.language()}</Label>
			<Select value={preference.modelOptions.lang} onValueChange={onValueChange}>
				<SelectTrigger>
					<SelectValue placeholder={m.language()} />
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
