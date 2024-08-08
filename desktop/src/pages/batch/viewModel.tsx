import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextFormat, formatExtensions } from '~/components/FormatSelect'
import { Segment, Transcript, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, pathToNamedPath } from '~/lib/utils'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import successSound from '~/assets/success.mp3'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { emit, listen } from '@tauri-apps/api/event'
import { usePreferenceProvider } from '~/providers/Preference'
import { useFilesContext } from '~/providers/FilesProvider'

export function viewModel() {
	const { files, setFiles } = useFilesContext()

	const [format, setFormat] = useState<TextFormat>('normal')
	const [currentIndex, setCurrentIndex] = useState(0)
	const [progress, setProgress] = useState<number | null>(null)
	const [inProgress, setInProgress] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const isAbortingRef = useRef<boolean>(false)
	const preference = usePreferenceProvider()
	const navigate = useNavigate()

	function getText(segments: Segment[], format: TextFormat) {
		if (format === 'srt') {
			return asSrt(segments)
		}
		if (format === 'vtt') {
			return asVtt(segments)
		}
		if (format === 'json') {
			return asJson(segments)
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
		listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
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

	async function start() {
		if (inProgress) {
			return
		}
		setInProgress(true)
		let localIndex = 0
		await invoke('load_model', { modelPath: preference.modelPath, gpuDevice: preference.gpuDevice })
		setCurrentIndex(localIndex)
		const loopStartTime = performance.now()
		for (const file of files) {
			try {
				if (isAbortingRef.current) {
					break
				}
				setProgress(null)
				const options = {
					path: file.path,
					...preference.modelOptions,
				}
				const startTime = performance.now()

				const diarizeOptions = { threshold: preference.diarizeThreshold, max_speakers: preference.maxSpeakers, enabled: preference.recognizeSpeakers }
				const res: Transcript = await invoke('transcribe', {
					options,
					modelPath: preference.modelPath,
					diarizeOptions,
				})

				// Calculate time
				let total = Math.round((performance.now() - startTime) / 1000)
				console.info(`Transcribe ${file.name} took ${total} seconds.`)

				// Write file
				const dst = await invoke<string>('get_path_dst', { src: file.path, suffix: formatExtensions[format] })
				await writeTextFile(dst, getText(res.segments, format))
				localIndex += 1
				await new Promise((resolve) => setTimeout(resolve, 100))
				setCurrentIndex(localIndex)
			} catch (error) {
				if (isAbortingRef.current) {
					navigate('/')
				} else {
					console.error(`error while transcribe ${file.name}: `, error)
				}
				localIndex += 1
				setCurrentIndex(localIndex)
			}
		}
		setCurrentIndex(files.length + 1)
		setInProgress(false)
		setIsAborting(false)
		setProgress(null)
		// Focus back the window and play sound
		if (preference!.soundOnFinish) {
			new Audio(successSound).play()
		}
		if (preference!.focusOnFinish) {
			webview.getCurrentWebviewWindow().unminimize()
			webview.getCurrentWebviewWindow().setFocus()
		}
		let total = Math.round((performance.now() - loopStartTime) / 1000)
		console.info(`Transcribed ${files.length} files in ${total}`)
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
		preference: preference,
	}
}
