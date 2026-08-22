import { useEffect, useState } from 'react'
import DocViewer from '~/components/DocViewer'
import { cn } from '~/lib/style'
import installDoc from '../../../docs/install.md?raw'
import modelsDoc from '../../../docs/models.md?raw'
import debugDoc from '../../../docs/debug.md?raw'
import buildingDoc from '../../../docs/building.md?raw'
import { m } from '~/paraglide/messages.js'

const docs = [
	{ name: 'Install', label: () => m.docsInstall(), content: installDoc },
	{ name: 'Models', label: () => m.docsModels(), content: modelsDoc },
	{ name: 'Debug', label: () => m.docsDebug(), content: debugDoc },
	{ name: 'Build', label: () => m.docsBuild(), content: buildingDoc },
]

function getDocUrl(hash: string) {
	const docName = hash.replace('#', '')
	const doc = docs.find((entry) => entry.name.toLowerCase() === docName.toLowerCase())

	return doc ? doc.content : docs[0].content
}

export default function Docs() {
	const [content, setContent] = useState(docs[0].content)

	useEffect(() => {
		if (window.location.hash) {
			setContent(getDocUrl(window.location.hash))
		}

		const onHashChange = () => setContent(getDocUrl(window.location.hash))
		window.addEventListener('hashchange', onHashChange)

		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20" dir="ltr">
			<header>
				<p className="eyebrow">Documentation</p>
				<h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground lg:text-[2.5rem]">{m.vibeDocumentation()}</h1>
			</header>

			<div className="mt-10 flex flex-col gap-10 lg:flex-row lg:gap-14">
				<nav className="flex shrink-0 flex-row flex-wrap gap-1 border-b border-border pb-4 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100dvh-8rem)] lg:w-44 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-s lg:pb-0 lg:ps-4">
					{docs.map((doc) => {
						const active = content === doc.content
						return (
							<button
								key={doc.name}
								type="button"
								onClick={() => {
									setContent(doc.content)
									window.location.hash = doc.name.toLowerCase()
								}}
								className={cn(
									'cursor-pointer rounded-full px-3 py-1.5 text-start text-[13px] transition-colors lg:rounded-md',
									active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
								)}>
								{doc.label()}
							</button>
						)
					})}
				</nav>

				<DocViewer content={content} />
			</div>
		</main>
	)
}
