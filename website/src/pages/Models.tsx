import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import CopyButton from '~/components/CopyButton'
import LanguageCombobox, { matchesQuery, type LanguageGroup, type LanguageOption } from '~/components/LanguageCombobox'
import { buttonVariants } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/style'
import latestRelease from '~/lib/latest_release.json'
import {
	ANY_LANGUAGE,
	catalogLanguages,
	deepLink,
	defaultLanguage,
	describe,
	formatSize,
	languageFromParam,
	modelsFor,
	needsNewerApp,
	type Model,
} from '~/lib/models'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection, type Locale } from '~/paraglide/runtime.js'

const latestVersion = latestRelease.version.replace(/^v/, '')

function nameOf(names: Intl.DisplayNames, code: string) {
	try {
		return names.of(code) ?? code
	} catch {
		return code
	}
}

/** Each language in the site's language, findable by its English name and by its own. */
function languageOptions(locale: string): LanguageOption[] {
	const localized = new Intl.DisplayNames([locale], { type: 'language' })
	const english = new Intl.DisplayNames(['en'], { type: 'language' })
	return catalogLanguages
		.map((code) => ({
			code,
			label: nameOf(localized, code),
			keywords: [nameOf(english, code), nameOf(new Intl.DisplayNames([code], { type: 'language' }), code)],
		}))
		.sort((a, b) => a.label.localeCompare(b.label, locale))
}

function LanguagePicker({ value, onSelect, locale }: { value: string; onSelect: (code: string) => void; locale: string }) {
	const [query, setQuery] = useState('')
	const any = useMemo<LanguageOption>(
		() => ({ code: ANY_LANGUAGE, label: m.modelsAnyLanguage(), keywords: ['any', 'all', 'multilingual'], globe: true, emphasis: true }),
		[locale],
	)
	const options = useMemo(() => languageOptions(locale), [locale])
	const needle = query.trim().toLowerCase()
	// Browsing: the likely choices first (any language, then the language the site is read in),
	// then the rest by name. Typing: one flat list of matches.
	const groups = useMemo<LanguageGroup[]>(() => {
		if (needle) return [{ label: null, items: [any, ...options].filter((option) => matchesQuery(option, needle)) }]
		const own = locale.split('-')[0].toLowerCase()
		return [
			{ label: null, items: [any, ...options.filter((option) => option.code === own)] },
			{ label: null, items: options.filter((option) => option.code !== own) },
		]
	}, [any, options, needle, locale])
	const current = [any, ...options].find((option) => option.code === value) ?? any

	return (
		<div className="w-full sm:w-64">
			<p className="mb-2 text-[13px] text-muted-foreground">{m.modelsLanguageLabel()}</p>
			<LanguageCombobox
				value={value}
				onSelect={onSelect}
				groups={groups}
				query={query}
				onQueryChange={setQuery}
				triggerLabel={current.label}
				searchLabel={m.modelsSearchLanguage()}
				ariaLabel={m.modelsLanguageLabel()}
				emptyLabel={m.modelsNoLanguage()}
			/>
		</div>
	)
}

/**
 * A translated pattern with one slot ("by {publisher}", "{publisher} 제공"), laid out as separate
 * isolated pieces so the Latin value in the slot cannot reorder the words around it.
 */
function Slotted({ pattern, children }: { pattern: (slot: string) => string; children: React.ReactNode }) {
	const [before, after] = pattern('\u0000')
		.split('\u0000')
		.map((part) => part.trim())
	return (
		<span className="inline-flex flex-wrap items-baseline gap-x-[0.3em]">
			{before && <bdi>{before}</bdi>}
			{children}
			{after && <bdi>{after}</bdi>}
		</span>
	)
}

function Details({ model, locale }: { model: Model; locale: string }) {
	return (
		<Popover>
			<PopoverTrigger
				aria-label={`${m.modelsDetails()}: ${model.name}`}
				className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground">
				<Info aria-hidden className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent align="end" collisionPadding={16} className="w-auto min-w-52 max-w-[min(20rem,calc(100vw-2rem))] p-4 text-[13px] leading-6">
				<p className="text-foreground">
					<Credit model={model} />
				</p>
				<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 text-muted-foreground">
					<dt>{m.modelsLicense()}</dt>
					<dd className="text-end text-foreground">
						<bdi dir="ltr">{model.license}</bdi>
					</dd>
					<dt>{m.modelsSize()}</dt>
					<dd className="text-end text-foreground">
						<bdi className="whitespace-nowrap">{formatSize(model.size, locale)}</bdi>
					</dd>
				</dl>
				{model.minAppVersion && (
					<p className="mt-2 border-t border-border pt-2 text-muted-foreground">
						<NeedsVersion version={model.minAppVersion} />
					</p>
				)}
			</PopoverContent>
		</Popover>
	)
}

function Credit({ model }: { model: Model }) {
	return (
		<Slotted pattern={(publisher) => m.modelsBy({ publisher })}>
			<a
				href={model.publisher.url}
				target="_blank"
				rel="noreferrer"
				dir="ltr"
				className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">
				{model.publisher.name}
			</a>
		</Slotted>
	)
}

function NeedsVersion({ version }: { version: string }) {
	return (
		<Slotted pattern={(slot) => m.modelsNeedsVersion({ version: slot })}>
			<bdi dir="ltr">{version}</bdi>
		</Slotted>
	)
}

function Card({ model, top, locale }: { model: Model; top: boolean; locale: string }) {
	const description = describe(model, locale)
	const titleId = `model-${model.id}`

	return (
		<li
			aria-labelledby={titleId}
			className={cn(
				'relative flex flex-col rounded-2xl border bg-card p-5 transition-[box-shadow,border-color] duration-150 hover:shadow-md',
				top ? 'model-card-top border-foreground/20 shadow-sm' : 'border-border hover:border-foreground/15',
			)}>
			{/* Sits on the card's edge, so the titles of a row stay on one line with or without it. */}
			{top && (
				<span className="absolute start-5 top-0 -translate-y-1/2 rounded-full border border-foreground/20 bg-background px-2.5 py-0.5 text-[11px] font-medium leading-4 text-foreground">
					{m.modelsTagRecommended()}
				</span>
			)}
			<div className="flex items-start justify-between gap-2">
				{/* Names are Latin: laid out left to right, but still hugging the card's reading edge. */}
				<h3 id={titleId} className="min-w-0 text-start text-[17px] font-semibold leading-6 tracking-[-0.02em] text-foreground">
					<bdi dir="ltr">{model.name}</bdi>
				</h3>
				<Details model={model} locale={locale} />
			</div>
			{/* Direction follows the language of the text shown, alignment follows the card. */}
			<p
				lang={description.locale}
				dir={getTextDirection(description.locale as Locale)}
				className="model-description mt-1.5 text-[14px] leading-6 text-muted-foreground">
				{description.text}
			</p>
			<ul className="model-meta mt-3 flex flex-wrap items-baseline gap-x-4 overflow-x-clip text-[13px] leading-6 text-muted-foreground">
				<li>
					<Credit model={model} />
				</li>
				<li>
					<bdi className="whitespace-nowrap tabular-nums">{formatSize(model.size, locale)}</bdi>
				</li>
			</ul>
			{needsNewerApp(model, latestVersion) && (
				<p className="text-[13px] leading-6 text-muted-foreground">
					<NeedsVersion version={model.minAppVersion!} />
				</p>
			)}
			<div className="mt-auto pt-4">
				<div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
					<a
						href={deepLink(model.url)}
						aria-label={`${m.modelsOpenInVibe()}: ${model.name}`}
						className={buttonVariants({ size: 'sm', variant: top ? 'default' : 'secondary' })}>
						{m.modelsOpenInVibe()}
					</a>
					<CopyButton text={model.url} label={m.modelsCopyLink()} copiedLabel={m.modelsCopied()} ariaLabel={`${m.modelsCopyLink()}: ${model.name}`} />
				</div>
			</div>
		</li>
	)
}

function Group({ list, top, locale }: { list: Model[]; top: Model | undefined; locale: string }) {
	return (
		<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{list.map((model) => (
				<Card key={model.id} model={model} top={model === top} locale={locale} />
			))}
		</ul>
	)
}

export default function Models() {
	const locale = getLocale()
	const [params, setParams] = useSearchParams()
	const language = languageFromParam(params.get('lang')) ?? defaultLanguage(locale)
	const { top, first, rest, divider } = useMemo(() => modelsFor(language), [language])

	useEffect(() => {
		document.title = `Vibe ${m.models()}`
		return () => {
			document.title = 'Vibe'
		}
	}, [locale])

	function choose(code: string) {
		const next = new URLSearchParams(params)
		next.set('lang', code)
		setParams(next, { replace: true, preventScrollReset: true })
	}

	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20" dir={getTextDirection(locale)}>
			<header className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="eyebrow">{m.models()}</p>
					<h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground lg:text-[2.5rem]">{m.modelsTitle()}</h1>
					<p className="mt-4 max-w-[46ch] text-[15px] leading-7 text-muted-foreground">{m.modelsLead()}</p>
				</div>
				<LanguagePicker value={language} onSelect={choose} locale={locale} />
			</header>

			<div className="mt-10" aria-live="polite">
				<Group list={first} top={top} locale={locale} />
				{rest.length > 0 && (
					<>
						<h2 className="eyebrow mb-5 mt-12 flex items-center gap-4 after:h-px after:flex-1 after:bg-border after:content-['']">
							{divider === 'every' ? m.modelsEveryLanguage() : m.modelsSpecificLanguages()}
						</h2>
						<Group list={rest} top={top} locale={locale} />
					</>
				)}
			</div>

			<p className="mt-10 max-w-[68ch] text-[13px] leading-6 text-muted-foreground">
				{m.modelsNoApp()}{' '}
				<Link to="/" className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">
					{m.download()}
				</Link>
			</p>
		</main>
	)
}
