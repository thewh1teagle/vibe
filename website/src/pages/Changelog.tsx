import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cn } from '~/lib/style'
import { findRelease, hasTranslations, isNewer, loadReleases, releases, sections, type Release, type Section } from '~/lib/changelog'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection, type Locale } from '~/paraglide/runtime.js'

const badge: Record<Section, string> = {
	New: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
	Improved: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
	Fixed: 'bg-amber-500/14 text-amber-800 dark:text-amber-300',
}

const label: Record<Section, () => string> = {
	New: () => m.changelogNew(),
	Improved: () => m.changelogImproved(),
	Fixed: () => m.changelogFixed(),
}

const inline = [
	'[&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:decoration-foreground',
	'[&_strong]:font-medium [&_strong]:text-foreground',
	'[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground',
].join(' ')

/** One formatter per locale — building an Intl.DateTimeFormat is the expensive part, not using it. */
const formatters = new Map<string, Intl.DateTimeFormat>()

/** Written in the language the entry is written in, so "4 בספטמבר 2026" sits under Hebrew notes. */
function formatDate(date: string, locale: string) {
	let formatter = formatters.get(locale)
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
		formatters.set(locale, formatter)
	}
	return formatter.format(new Date(`${date}T00:00:00Z`))
}

/**
 * The version on the stable channel, read from the file the app itself updates from. A release
 * newer than it has only reached the beta channel, and stops being marked the moment it is promoted.
 */
function useStableVersion() {
	const [version, setVersion] = useState<string | null>(null)
	useEffect(() => {
		let alive = true
		fetch(`${import.meta.env.BASE_URL}updater/stable.json`)
			.then((response) => (response.ok ? response.json() : null))
			.then((channel) => {
				if (alive && typeof channel?.version === 'string') setVersion(channel.version)
			})
			.catch(() => {})
		return () => {
			alive = false
		}
	}, [])
	return version
}

function Entry({ release, single, beta }: { release: Release; single: boolean; beta: boolean }) {
	const id = `v${release.version}`
	return (
		<article
			id={id}
			className="grid scroll-mt-24 gap-4 border-t border-border py-12 [contain-intrinsic-size:auto_28rem] [content-visibility:auto] first:border-t-0 lg:grid-cols-[10rem_1fr] lg:gap-12"
			dir={getTextDirection(release.locale as Locale)}>
			{/* The version and date stay put while the entry's notes scroll past. */}
			<div className="lg:sticky lg:top-24 lg:self-start">
				<Link to={`/changelog/${release.version}`} className="text-[15px] font-medium text-foreground transition-colors hover:text-primary">
					{id}
				</Link>
				{beta && (
					<span className="ms-2 inline-block rounded-full bg-violet-500/12 px-2 py-0.5 align-middle text-[11px] font-medium tracking-wide text-violet-700 dark:text-violet-300">
						{m.changelogBeta()}
					</span>
				)}
				<time dateTime={release.date} className="mt-1 block text-[13px] text-muted-foreground">
					{formatDate(release.date, release.locale)}
				</time>
				{beta && <p className="mt-2 max-w-[18rem] text-[12px] leading-5 text-muted-foreground">{m.changelogBetaHint()}</p>}
				{single && (
					<Link
						to="/changelog"
						className="mt-4 block text-[13px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
						{m.changelogAll()}
					</Link>
				)}
			</div>
			<div className="max-w-[68ch]">
				<h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">{release.title}</h2>
				{sections.map((section) => {
					const items = release.items.filter((item) => item.section === section)
					if (items.length === 0) return null
					return (
						<section key={section} className="mt-7">
							<span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium tracking-wide', badge[section])}>
								{label[section]()}
							</span>
							<ul className="mt-3 list-disc space-y-2 ps-5 text-[15px] leading-7 text-muted-foreground">
								{items.map((item, i) => (
									<li key={i} className={inline} dangerouslySetInnerHTML={{ __html: item.html }} />
								))}
							</ul>
						</section>
					)
				})}
			</div>
		</article>
	)
}

export default function Changelog() {
	const { version } = useParams()
	const stable = useStableVersion()
	// A locale with translations waits for them instead of painting English first: swapping
	// English for, say, Hebrew a moment later flips direction and reflows the whole page.
	const [list, setList] = useState<Release[] | null>(() => (hasTranslations(getLocale()) ? null : releases))
	const one = version && list ? findRelease(version, list) : undefined
	const shown = one ? [one] : (list ?? [])

	useEffect(() => {
		if (list) return
		let live = true
		loadReleases(getLocale()).then((translated) => {
			if (live) setList(translated)
		})
		return () => {
			live = false
		}
	}, [])

	useEffect(() => {
		document.title = one ? `Vibe v${one.version}: ${one.title}` : `Vibe ${m.changelog()}`
		return () => {
			document.title = 'Vibe'
		}
	}, [one])

	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20">
			<header dir={getTextDirection(getLocale())}>
				<p className="eyebrow">Vibe</p>
				<h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground lg:text-[2.5rem]">{m.changelog()}</h1>
				{version && list && !one && <p className="mt-4 text-muted-foreground">{m.changelogUnknownVersion({ version })}</p>}
			</header>
			{/* Holds the page's height while translations load, so the footer does not jump up and back. */}
			<div className={cn('mt-6', !list && 'min-h-[100vh]')}>
				{shown.map((release) => (
					<Entry key={release.version} release={release} single={Boolean(one)} beta={stable !== null && isNewer(release.version, stable)} />
				))}
			</div>
		</main>
	)
}
