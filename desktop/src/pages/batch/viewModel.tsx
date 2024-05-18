import { invoke } from '@tauri-apps/api/core'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import { TextFormat, formatExtensions } from '~/components/FormatSelect'
import { LocalModelArgs } from '~/components/Params'
import { preferences } from '~/lib/config'
import { Segment, Transcript, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath } from '~/lib/utils'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import successSound from '~/assets/success.mp3'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { join } from '@tauri-apps/api/path'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'

export function viewModel() {
	const location = useLocation()
	const [files, setFiles] = useState((location?.state?.files as NamedPath[]) ?? [])
	const [format, setFormat] = useState<TextFormat>('normal')
	const [index, setIndex] = useState(0)
	const [progress, setProgress] = useState<number | null>(null)
	const [inProgress, setInProgress] = useState(false)
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const [soundOnFinish, _setSoundOnFinish] = useLocalStorage(preferences.soundOnFinish.key, preferences.soundOnFinish.default)
	const [focusOnFinish, _setFocusOnFinish] = useLocalStorage(preferences.focusOnFinish.key, preferences.focusOnFinish.default)
	const [modelPath, setModelPath] = useLocalStorage<string | null>(preferences.modealPath.key, preferences.modealPath.default)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const navigate = useNavigate()
	// Model args
	const [lang, setLang] = useLocalStorage('transcribe_lang_code', 'en')
	const [args, setArgs] = useLocalStorage<LocalModelArgs>('model_args', {
		init_prompt: '',
		verbose: false,
		lang,
		n_threads: 4,
		temperature: 0.4,
	})

	function getText(segments: Segment[], format: TextFormat) {
		if (format === 'srt') {
			return asSrt(segments)
		}
		if (format === 'vtt') {
			return asVtt(segments)
		}
		return asText(segments)
	}

	async function selectFiles() {
		const selected = await dialog.open({
			multiple: true,
			filters: [
				{
					name: 'Audio',
					extensions: [...config.audioExtensions, ...config.videoExtensions],
				},
			],
		})
		if (selected) {
			const newFiles: NamedPath[] = []
			for (const file of selected) {
				newFiles.push({ name: file.name ?? '', path: file.path })
			}
			setFiles(newFiles)

			if (newFiles.length === 1) {
				navigate('/', { state: { files: newFiles } })
			}
		}
	}

	async function start() {
		console.log('starting...')
		setInProgress(true)
		try {
			for (const [index, file] of files.entries()) {
				setIndex(index)
				const res: Transcript = await invoke('transcribe', { options: { ...args, model: modelPath, path: file.path, lang } })
				const dst = await invoke<string>('get_path_dst', { src: file.path, suffix: formatExtensions[format] })
				await writeTextFile(dst, getText(res.segments, format))
			}
		} catch (error) {
			if (!abortRef.current) {
				console.error('error: ', error)
				setErrorModal?.({ log: String(error), open: true })
			}
		} finally {
			setInProgress(false)
			setIndex(0)
			setProgress(null)
			setIsAborting(false)
			// Focus back the window and play sound
			if (soundOnFinish) {
				new Audio(successSound).play()
			}
			if (focusOnFinish) {
				webview.getCurrent().unminimize()
				webview.getCurrent().setFocus()
			}
		}
	}

	async function ListenForProgress() {
		await listen('transcribe_progress', (event) => {
			const value = event.payload as number
			if (value >= 0 && value <= 100) {
				setProgress(value)
			}
		})
	}

	useEffect(() => {
		ListenForProgress()
	}, [])

	async function cancel() {
		setIsAborting(true)
		setInProgress(false)
	}

	return {
		selectFiles,
		isAborting,
		inProgress,
		setInProgress,
		progress,
		setProgress,
		index,
		setIndex,
		cancel,
		start,
		files,
		format,
		setFormat,
		lang,
		setLang,
		args,
		setArgs,
	}
}
