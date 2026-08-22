import { convertFileSrc } from '@tauri-apps/api/core'
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

/**
 * How long the media at `path` runs, in whole seconds, or `null` when the webview cannot read it —
 * an exotic container, a file that moved away, a decoder that never answers. Analytics uses it as
 * the denominator of a transcription: without it, "do long files fail more?" has no answer.
 *
 * Metadata only: nothing is decoded or downloaded beyond the header.
 */
export function getMediaDurationSeconds(path: string, timeoutMs = 5000): Promise<number | null> {
	return new Promise((resolve) => {
		let audio: HTMLAudioElement
		try {
			audio = new Audio(convertFileSrc(path))
		} catch {
			resolve(null)
			return
		}
		audio.preload = 'metadata'

		let timer = 0
		const finish = (seconds: number | null) => {
			window.clearTimeout(timer)
			audio.removeEventListener('loadedmetadata', onMetadata)
			audio.removeEventListener('error', onError)
			// Let the element go before it buffers anything.
			audio.src = ''
			resolve(seconds)
		}
		const onMetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null)
		const onError = () => finish(null)

		audio.addEventListener('loadedmetadata', onMetadata)
		audio.addEventListener('error', onError)
		timer = window.setTimeout(() => finish(null), timeoutMs)
	})
}
