import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Info } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { LanguageCombobox, matchesQuery, type LanguageGroup, type LanguageOption } from '~/components/language-combobox'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { ANY_LANGUAGE, describeModel, formatModelSize, type CatalogModel } from '~/lib/model-catalog'
import { cn } from '~/lib/style'
import { useModelCatalog, type ModelCatalogViewModel } from '../use-model-catalog'
import type { SettingsViewModel } from './shared'

function languageName(code: string, locale: string) {
	try {
		return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
	} catch {
		return code
	}
}

/** The transcription-language control, over the languages the catalog has models for. */
function CatalogLanguagePicker({ catalog, locale }: { catalog: ModelCatalogViewModel; locale: string }) {
	const [query, setQuery] = useState('')

	const anyLanguage = useMemo<LanguageOption>(
		() => ({ code: ANY_LANGUAGE, label: m.modelCatalogAnyLanguage(), keywords: ['any', 'multilingual'], globe: true, emphasis: true }),
		[locale],
	)
	const entries = useMemo<LanguageOption[]>(
		() =>
			catalog.languages
				.map((code) => ({ code, label: languageName(code, locale), keywords: [languageName(code, 'en'), languageName(code, code)], flagCode: code }))
				.sort((a, b) => a.label.localeCompare(b.label, locale)),
		[catalog.languages, locale],
	)

	const needle = query.trim().toLowerCase()
	const groups = useMemo<LanguageGroup[]>(() => {
		if (needle) return [{ label: null, items: [anyLanguage, ...entries].filter((entry) => matchesQuery(entry, needle)) }]
		return [
			{ label: null, items: [anyLanguage] },
			{ label: null, items: entries },
		]
	}, [anyLanguage, entries, needle])

	return (
		<LanguageCombobox
			variant="prominent"
			className="h-8 w-[176px] font-normal"
			align="end"
			value={catalog.language}
			onSelect={catalog.setLanguage}
			groups={groups}
			query={query}
			onQueryChange={setQuery}
			triggerLabel={[anyLanguage, ...entries].find((entry) => entry.code === catalog.language)?.label ?? m.selectLanguage()}
			ariaLabel={m.language()}
		/>
	)
}

const actionClass = 'h-8 min-w-[76px] shrink-0 rounded-full px-4 text-[13px]'
/** A filled neutral button: `secondary` is nearly the card colour in the dark theme, so it would vanish here. */
const secondaryActionClass = 'bg-foreground/[0.08] text-foreground shadow-none hover:bg-foreground/[0.14] dark:bg-foreground/[0.12] dark:hover:bg-foreground/20'

interface RowProps {
	model: CatalogModel
	catalog: ModelCatalogViewModel
	locale: string
}

/** The publisher is a link inside a translated phrase; some languages put the name before the word. */
function Publisher({ model, quiet }: { model: CatalogModel; quiet?: boolean }) {
	const [before, after] = m.modelCatalogBy({ publisher: '\u0000' }).split('\u0000')
	const { name, url } = model.publisher
	return (
		<span>
			{before}
			<bdi dir="ltr">
				{url ? (
					<button
						type="button"
						onClick={() => openUrl(url)}
						className={cn(
							'cursor-pointer rounded-sm underline-offset-[3px] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
							!quiet && 'underline decoration-border',
						)}>
						{name}
					</button>
				) : (
					name
				)}
			</bdi>
			{after}
		</span>
	)
}

function Description({ model, locale, className }: RowProps & { className?: string }) {
	const description = describeModel(model, locale)
	// Aligned with the UI, laid out in the direction of the text itself: English falls back into RTL locales.
	return (
		<p dir={description.dir} className={cn('text-muted-foreground [text-align:match-parent]', className)}>
			{description.text}
		</p>
	)
}

/** Who made the model and on what terms, kept one click away so the list stays a list. */
function Details({ model, catalog, locale }: RowProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={m.modelCatalogDetails()}
					className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 data-[state=open]:text-foreground">
					<Info className="h-3.5 w-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 space-y-3 rounded-2xl p-4">
				<div className="space-y-1">
					<p dir="ltr" className="text-sm font-medium [text-align:match-parent]">
						{model.name}
					</p>
					<Description model={model} catalog={catalog} locale={locale} className="text-xs leading-relaxed" />
				</div>
				<dl className="space-y-1.5 border-t border-border/50 pt-3 text-xs">
					<div className="text-muted-foreground">
						<Publisher model={model} />
					</div>
					{model.license && (
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">{m.modelCatalogLicense()}</dt>
							<dd dir="ltr">{model.license}</dd>
						</div>
					)}
					{model.size && (
						<div className="flex justify-between gap-4">
							<dt className="text-muted-foreground">{m.modelCatalogSize()}</dt>
							<dd>
								<bdi>{formatModelSize(model.size, locale)}</bdi>
							</dd>
						</div>
					)}
				</dl>
			</PopoverContent>
		</Popover>
	)
}

/** Install, or the running download's percentage and a way to stop it, in the same place. */
function InstallAction({ model, catalog, primary }: Omit<RowProps, 'locale'> & { primary?: boolean }) {
	if (catalog.active?.id === model.id) {
		const { progress } = catalog.active
		return (
			<div className="flex shrink-0 items-center gap-2.5">
				{progress != null && (
					<span dir="ltr" className="text-xs tabular-nums text-muted-foreground">
						{Math.round(progress)}%
					</span>
				)}
				<Button type="button" size="sm" className={cn(actionClass, secondaryActionClass)} onClick={catalog.cancel}>
					{m.cancel()}
				</Button>
			</div>
		)
	}
	const installed = catalog.installed(model)
	if (installed?.inUse) return null
	if (installed) {
		return (
			<Button type="button" size="sm" className={cn(actionClass, secondaryActionClass)} onClick={() => catalog.use(installed.path)}>
				{m.modelCatalogUse()}
			</Button>
		)
	}
	return (
		<Button
			type="button"
			size="sm"
			className={cn(actionClass, !primary && secondaryActionClass)}
			disabled={catalog.active !== null}
			onClick={() => catalog.install(model)}>
			{catalog.unverified === model.id ? m.tryAgain() : m.modelCatalogInstall()}
		</Button>
	)
}

/** The size while there is something to download; afterwards whether the model is installed or the one in use. */
function Meta({ model, catalog, locale }: RowProps) {
	const installed = catalog.active?.id === model.id ? null : catalog.installed(model)
	if (installed) {
		return (
			<span className="flex h-8 items-center gap-1 text-xs text-muted-foreground animate-in-smooth">
				<Check className={cn('h-3.5 w-3.5', installed.inUse && 'text-primary')} strokeWidth={2.5} />
				{installed.inUse ? m.modelCatalogInUse() : m.modelCatalogInstalled()}
			</span>
		)
	}
	return model.size ? <bdi className="text-xs tabular-nums text-muted-foreground">{formatModelSize(model.size, locale)}</bdi> : null
}

function InstallStatus({ model, catalog }: Omit<RowProps, 'locale'>) {
	const active = catalog.active?.id === model.id ? catalog.active : null
	return (
		<>
			{active && <Progress className="progress-aurora mt-3 h-1 bg-foreground/10 rtl:-scale-x-100" value={active.progress ?? 0} aria-label={m.downloadingModel()} />}
			{catalog.unverified === model.id && <p className="mt-2 text-xs text-destructive">{m.modelCatalogVerificationFailed()}</p>}
		</>
	)
}

function Row({ model, catalog, locale }: RowProps) {
	const recommended = catalog.view.recommendedId === model.id
	const description = describeModel(model, locale)
	return (
		<div className="px-4 py-3.5">
			<div className="flex items-center gap-4">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-1.5">
						{/* The icon travels with the name, so a wrap never leaves it alone on a line. */}
						<span className="flex min-w-0 items-center gap-1.5">
							<span dir="ltr" className="text-sm font-medium text-foreground">
								{model.name}
							</span>
							<Details model={model} catalog={catalog} locale={locale} />
						</span>
						{recommended && <span className="text-xs text-muted-foreground">{m.modelTagRecommended()}</span>}
					</div>
					{/* One run of text that may wrap; the description keeps the direction of its own language. */}
					<p className="mt-0.5 text-xs text-muted-foreground">
						<bdi dir={description.dir}>{description.text}</bdi>
						{' '}
						<span className="whitespace-nowrap">
							<span aria-hidden="true">· </span>
							<Publisher model={model} quiet />
						</span>
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<Meta model={model} catalog={catalog} locale={locale} />
					<InstallAction model={model} catalog={catalog} primary={recommended} />
				</div>
			</div>
			<InstallStatus model={model} catalog={catalog} />
		</div>
	)
}

function List({ title, models, catalog, locale }: { title?: string; models: CatalogModel[]; catalog: ModelCatalogViewModel; locale: string }) {
	if (models.length === 0) return null
	return (
		<section className="space-y-2">
			{title && <h3 className="px-1 text-xs font-medium text-muted-foreground">{title}</h3>}
			<div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
				{models.map((model) => (
					<Row key={model.id} model={model} catalog={catalog} locale={locale} />
				))}
			</div>
		</section>
	)
}

interface ModelCatalogSectionProps {
	vm: SettingsViewModel
	onAddModel: () => void
	/** The title line of the settings page, where the language picker goes. */
	headerSlot: HTMLElement | null
}

export function ModelCatalogSection({ vm, onAddModel, headerSlot }: ModelCatalogSectionProps) {
	const catalog = useModelCatalog(vm)
	const locale = vm.preference.displayLanguage
	const { primary, multilingual } = catalog.view

	return (
		<div className="space-y-6">
			{headerSlot && createPortal(<CatalogLanguagePicker catalog={catalog} locale={locale} />, headerSlot)}
			<List models={primary} catalog={catalog} locale={locale} />
			<List title={m.modelCatalogMultilingual()} models={multilingual} catalog={catalog} locale={locale} />
			<p className="px-1 text-center text-xs text-muted-foreground">
				{m.modelCatalogOwnModel()}{' '}
				<button type="button" onClick={onAddModel} className="cursor-pointer underline decoration-border underline-offset-[3px] hover:text-foreground">
					{m.modelCatalogAddModel()}
				</button>
			</p>
		</div>
	)
}
