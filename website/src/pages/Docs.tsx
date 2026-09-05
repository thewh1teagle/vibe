import { useEffect, useState } from 'react'
import DocViewer from '~/components/DocViewer'
import { cn } from '~/lib/style'
import { docs as englishDocs, loadDocs, slugs, type Doc, type Slug } from '~/lib/docs'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection, type Locale } from '~/paraglide/runtime.js'

const label: Record<Slug, () => string> = {
	install: () => m.docsInstall(),
	models: () => m.docsModels(),
}

function slugFromHash(hash: string): Slug {
	const wanted = hash.replace('#', '').toLowerCase()
	return slugs.find((slug) => slug === wanted) ?? slugs[0]
}

export default function Docs() {
	// The English pages paint immediately; this locale's translations swap in once fetched.
	const [pages, setPages] = useState<Doc[]>(englishDocs)
	const [slug, setSlug] = useState<Slug>(slugs[0])
	const shown = pages.find((doc) => doc.slug === slug) ?? pages[0]

	useEffect(() => {
		let live = true
		loadDocs(getLocale()).then((translated) => {
			if (live) setPages(translated)
		})
		return () => {
			live = false
		}
	}, [])

	useEffect(() => {
		if (window.location.hash) setSlug(slugFromHash(window.location.hash))

		const onHashChange = () => setSlug(slugFromHash(window.location.hash))
		window.addEventListener('hashchange', onHashChange)

		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20" dir={getTextDirection(getLocale())}>
			<header>
				<p className="eyebrow">Documentation</p>
				<h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground lg:text-[2.5rem]">{m.vibeDocumentation()}</h1>
			</header>

			<div className="mt-10 flex flex-col gap-10 lg:flex-row lg:gap-14">
				<nav className="flex shrink-0 flex-row flex-wrap gap-1 border-b border-border pb-4 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100dvh-8rem)] lg:w-44 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-s lg:pb-0 lg:ps-4">
					{slugs.map((entry) => (
						<button
							key={entry}
							type="button"
							onClick={() => {
								setSlug(entry)
								window.location.hash = entry
							}}
							className={cn(
								'cursor-pointer rounded-full px-3 py-1.5 text-start text-[13px] transition-colors lg:rounded-md',
								entry === slug ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
							)}>
							{label[entry]()}
						</button>
					))}
				</nav>

				{/* An untranslated page stays English, so the article follows its own direction. */}
				<div className="min-w-0 flex-1" dir={getTextDirection(shown.locale as Locale)}>
					<DocViewer content={shown.markdown} />
				</div>
			</div>
		</main>
	)
}
