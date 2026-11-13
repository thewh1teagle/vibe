/** Text with every occurrence of the search query marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
	if (!query) return <>{text}</>
	const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
	return (
		<>
			{parts.map((part, index) =>
				part.toLowerCase() === query.toLowerCase() ? (
					<mark key={index} className="rounded bg-primary/20 text-foreground">
						{part}
					</mark>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	)
}
