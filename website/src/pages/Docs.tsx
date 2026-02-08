import { useEffect, useState } from 'react'
import DocViewer from '~/components/DocViewer'
import { Button } from '~/components/ui/button'
import installDoc from '../../../docs/install.md?raw'
import modelsDoc from '../../../docs/models.md?raw'
import debugDoc from '../../../docs/debug.md?raw'
import buildingDoc from '../../../docs/building.md?raw'

const docs = [
	{ name: 'Install', content: installDoc },
	{ name: 'Models', content: modelsDoc },
	{ name: 'Debug', content: debugDoc },
	{ name: 'Build', content: buildingDoc },
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
		<div className="m-auto max-w-[81%] lg:max-w-[680px]" dir="ltr">
			<h1 className="mb-6 text-4xl font-bold">Vibe Documentation</h1>

			<div className="mb-8 flex flex-wrap justify-center gap-2 rounded-xl border border-border bg-card/60 p-2">
				{docs.map((doc) => (
					<Button
						key={doc.name}
						variant={content === doc.content ? 'default' : 'ghost'}
						size="sm"
						onClick={() => {
							setContent(doc.content)
							window.location.hash = doc.name.toLowerCase()
						}}>
						{doc.name}
					</Button>
				))}
			</div>

			<DocViewer content={content} />
		</div>
	)
}
