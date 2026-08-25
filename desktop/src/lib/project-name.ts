import type { ProjectSource } from './types'

const sourcePrefixes: Record<ProjectSource, string> = {
	record: 'Record-',
	url: 'Url-',
	file: 'File-',
}

/** Build the default saved-project name. User-entered names never pass through this helper. */
export function autoProjectName(name: string, source: ProjectSource = 'file'): string {
	return `${sourcePrefixes[source]}${name}`
}
