export function relativeURL(path: string) {
	if (path.startsWith('/')) {
		path = path.slice(1)
	}
	return `${import.meta.env.BASE_URL}${path}`
}
