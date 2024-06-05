export function relativeURL(path: string) {
	const baseURL = import.meta.env.PROD ? '/vibe' : ''
	if (!path.startsWith('/')) {
		path = '/' + path
	}
	return `${baseURL}${path}`
}
