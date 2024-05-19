import { invoke } from '@tauri-apps/api/core'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import { TextFormat, formatExtensions } from '~/components/FormatSelect'
import { LocalModelArgs } from '~/components/Params'
import { Segment, Transcript, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, pathToNamedPath } from '~/lib/utils'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import successSound from '~/assets/success.mp3'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { emit, listen } from '@tauri-apps/api/event'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import * as os from '@tauri-apps/plugin-os'
import { usePreferencesContext } from '~/providers/Preferences'

export function viewModel() {
	const location = useLocation()
	const [files, setFiles] = useState<NamedPath[]>(location?.state?.files)
	const [format, setFormat] = useState<TextFormat>('normal')
	const [currentIndex, setCurrentIndex] = useState(0)
	const [progress, setProgress] = useState<number | null>(null)
	const [inProgress, setInProgress] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const isAbortingRef = useRef<boolean>(false)
	const preferences = usePreferencesContext()
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

	useEffect(() => {
		setInProgress(false)
		setCurrentIndex(0)
	}, [files])

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

	async function handleDrop() {
		listen<{ paths: string[] }>('tauri://drop', async (event) => {
			const newFiles: NamedPath[] = []
			for (const path of event.payload.paths) {
				const file = await pathToNamedPath(path)
				newFiles.push({ name: file.name, path: file.path })
			}
			setFiles([
				...newFiles.filter((f) => {
					const path = f.path.toLowerCase()
					return (
						config.videoExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
						config.audioExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
						files.includes(f)
					)
				}),
			])

			if (newFiles.length === 1) {
				navigate('/', { state: { files: newFiles } })
			}
		})
	}

	async function handleDeepLinks() {
		const platform = await os.platform()
		let newFiles = []
		if (platform === 'macos') {
			await onOpenUrl(async (urls) => {
				for (let url of urls) {
					if (url.startsWith('file://')) {
						url = decodeURIComponent(url)
						url = url.replace('file://', '')
						// take only the first one
						newFiles.push(await pathToNamedPath(url))
					}
				}
			})
		} else if (platform == 'windows' || platform == 'linux') {
			const urls: string[] = await invoke('get_deeplinks')
			for (const url of urls) {
				newFiles.push(await pathToNamedPath(url))
			}
		}
		newFiles = newFiles.filter((f) => {
			const path = f.path.toLowerCase()
			return (
				config.videoExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
				config.audioExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
				files.includes(f)
			)
		})
		if (newFiles.length > 1) {
			setFiles(newFiles)
		}
		if (newFiles.length === 1) {
			navigate('/', { state: { files: newFiles } })
		}
	}

	async function start() {
		setInProgress(true)
		let localIndex = 0
		try {
			setCurrentIndex(localIndex)
			for (const file of files) {
				if (isAbortingRef.current) {
					break
				}
				setProgress(null)
				const res: Transcript = await invoke('transcribe', { options: { ...args, model: preferences!.modelPath, path: file.path, lang } })
				const dst = await invoke<string>('get_path_dst', { src: file.path, suffix: formatExtensions[format] })
				await writeTextFile(dst, getText(res.segments, format))
				localIndex += 1
				await new Promise((resolve) => setTimeout(resolve, 100))
				setCurrentIndex(localIndex)
			}
		} catch (error) {
			if (!isAbortingRef.current) {
				console.error('error: ', error)
				setErrorModal?.({ log: String(error), open: true })
			}
		} finally {
			if (isAbortingRef.current) {
				navigate('/')
			} else {
				localIndex += 1
				setCurrentIndex(localIndex)
				setInProgress(false)
				setIsAborting(false)
				setProgress(null)
				// Focus back the window and play sound
				if (preferences!.soundOnFinish) {
					new Audio(successSound).play()
				}
				if (preferences!.focusOnFinish) {
					webview.getCurrent().unminimize()
					webview.getCurrent().setFocus()
				}
			}
		}
	}

	async function ListenForProgress() {
		await listen<number>('transcribe_progress', (event) => {
			const value = event.payload
			if (value >= 0 && value <= 100) {
				setProgress(value)
			}
		})
	}

	useEffect(() => {
		handleDeepLinks()
		handleDrop()
		ListenForProgress()
	}, [])

	async function cancel() {
		if (isAbortingRef.current) {
			return
		}
		isAbortingRef.current = true

		emit('abort_transcribe')
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
		currentIndex,
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
