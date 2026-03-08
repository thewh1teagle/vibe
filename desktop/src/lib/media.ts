import * as config from './config'

export function validPath(path: string) {
	if (config.videoExtensions.some((ext) => path.endsWith(ext))) {
		return true
	}
	if (config.audioExtensions.some((ext) => path.endsWith(ext))) {
		return true
	}
	return false
}
