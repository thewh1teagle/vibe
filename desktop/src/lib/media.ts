import * as config from './config'

const mediaExtensions = [...config.videoExtensions, ...config.audioExtensions]

/**
 * Whether `path` is a media file we can transcribe. The extension is compared without regard to
 * case: recorders and phones write `.MP3` and `.MOV`, and those were being rejected silently.
 */
export function validPath(path: string) {
	const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
	const name = path.slice(separator + 1)
	const dot = name.lastIndexOf('.')
	if (dot < 1) {
		return false
	}

	return mediaExtensions.includes(name.slice(dot + 1).toLowerCase())
}
