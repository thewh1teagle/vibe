import { useEffect, useState } from 'react'
import DocViewer from '~/components/DocViewer'
import { Button } from '~/components/ui/button'

const docs = [
	{ name: 'Install', url: '/vibe/docs/install.md' },
	{ name: 'Models', url: '/vibe/docs/models.md' },
	{ name: 'Debug', url: '/vibe/docs/debug.md' },
	{ name: 'Build', url: '/vibe/docs/building.md' },
]

function getDocUrl(hash: string) {
	const docName = hash.replace('#', '')
	const doc = docs.find((entry) => entry.name.toLowerCase() === docName.toLowerCase())

	return doc ? doc.url : docs[0].url
}

export default function Docs() {
	const [url, setUrl] = useState(docs[0].url)

	useEffect(() => {
		if (window.location.hash) {
			setUrl(getDocUrl(window.location.hash))
		}

		const onHashChange = () => setUrl(getDocUrl(window.location.hash))
		window.addEventListener('hashchange', onHashChange)

		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	return (
		<div className="m-auto max-w-[81%] lg:max-w-[680px]" dir="ltr">
			<h1 className="mb-6 text-4xl font-bold">Vibe Documentation</h1>

			<div className="mb-8 flex flex-wrap justify-center gap-2 rounded-xl border border-border bg-card/60 p-2">
				{docs.map((doc) => (
					<Button
						key={doc.name}
						variant={url === doc.url ? 'default' : 'ghost'}
						size="sm"
						onClick={() => {
							setUrl(doc.url)
							window.location.hash = doc.name.toLowerCase()
						}}>
						{doc.name}
					</Button>
				))}
			</div>

			<DocViewer url={url} />
		</div>
	)
}
