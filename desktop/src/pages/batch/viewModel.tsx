import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TextFormat, formatExtensions } from '~/components/FormatSelect'
import { Segment, Transcript, asCsv, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath, pathToNamedPath, startKeepAwake, stopKeepAwake } from '~/lib/utils'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import successSound from '~/assets/success.mp3'
import * as fs from '@tauri-apps/plugin-fs'
import { emit, listen } from '@tauri-apps/api/event'
import { usePreferenceProvider } from '~/providers/Preference'
import { useFilesContext } from '~/providers/FilesProvider'
import { basename } from '@tauri-apps/api/path'
import { Claude, Ollama, Llm } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { path } from '@tauri-apps/api'
import { toDocx } from '~/lib/docx'
import { toast } from 'sonner'

export function viewModel() {
	const { files, setFiles } = useFilesContext()

	const [formats, setFormats] = useState<TextFormat[]>(['normal'])
	const [currentIndex, setCurrentIndex] = useState(0)
	const [progress, setProgress] = useState<number | null>(null)
	const [inProgress, setInProgress] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const isAbortingRef = useRef<boolean>(false)
	const preference = usePreferenceProvider()
	const navigate = useNavigate()
	const [llm, setLlm] = useState<Llm | null>(null)
	const location = useLocation()
	const [outputFolder, setOutputFolder] = useState('')

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
			setLlm(llmInstance)
		} else {
			const llmInstance = new Claude(preference.llmConfig)
			setLlm(llmInstance)
		}
	}, [preference.llmConfig])

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
		if (format === 'csv') {
			return asCsv(segments)
		}
		return asText(segments)
	}

	async function checkFilesState() {
		if (location?.state?.files) {
			const newFiles: NamedPath[] = []
			for (const path of location.state.files) {
				const name = await basename(path)
				newFiles.push({ name, path })
			}
			setFiles(newFiles)
		}
	}

	async function checkOutputFolderState() {
		if (location.state?.outputFolder && !outputFolder) {
			if (await fs.exists(location.state?.outputFolder)) {
				setOutputFolder(location.state?.outputFolder)
			}
		}
	}

	useEffect(() => {
		checkOutputFolderState()
	}, [])

	useEffect(() => {
		checkFilesState()
	}, [])

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
			for (const path of selected) {
				const name = await basename(path)
				newFiles.push({ name, path })
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

		startKeepAwake()

		let localIndex = 0
		if (!preference.modelPath) {
			throw new Error('No model selected. Please download or select a model first.')
		}
		await invoke('load_model', { modelPath: preference.modelPath })
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

				// Check if exists
				const someFormat = formatExtensions[formats[0]]
				const ext = await path.extname(file.path)
				let dst = file.path.slice(0, -ext.length - 1) + someFormat
				const baseName = await path.basename(dst)
				if (!preference.advancedTranscribeOptions.saveNextToAudioFile && outputFolder) {
					dst = await path.join(outputFolder, baseName)
				}
				file.path = dst

				if (preference.advancedTranscribeOptions.skipIfExists && !outputFolder && (await fs.exists(dst))) {
					// ^ We can't know if it's not next to the audio file, multiple files can have the same names
					localIndex += 1
					setCurrentIndex(localIndex)
					continue
				}

				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, {
					source: 'batch',
				})
				const res: Transcript = await invoke('transcribe', {
					options,
				})

				// Calculate time
				let total = Math.round((performance.now() - startTime) / 1000)
				console.info(`Transcribe ${file.name} took ${total} seconds.`)
				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
					source: 'batch',
					duration_seconds: total,
					segments_count: res.segments.length,
				})

				let llmSegments: Segment[] | null = null
				if (llm && preference.llmConfig?.enabled) {
					try {
						const question = `${preference.llmConfig.prompt.replace('%s', transcript.asText(res.segments))}`
						const answer = await llm.ask(question)
						if (answer) {
							llmSegments = [{ start: 0, stop: res.segments?.[res.segments?.length - 1].stop ?? 0, text: answer }]
						}
					} catch (e) {
						toast.error(String(e))
						console.error(e)
					}
				}

				for (const format of formats) {
					const dst = await invoke<string>('get_path_dst', { src: file.path, suffix: formatExtensions[format] })
					// Write file
					if (format === 'docx') {
						const fileName = await path.basename(dst)
						const doc = await toDocx(fileName, res.segments, preference.textAreaDirection)
						const arrayBuffer = await doc.arrayBuffer()
						const buffer = new Uint8Array(arrayBuffer)
						fs.writeFile(dst, buffer)
					} else {
						await fs.writeTextFile(dst, getText(res.segments, format))
					}
				}
				if (llmSegments) {
					const summaryPath = await invoke<string>('get_path_dst', { src: file.path, suffix: '.summary.txt' })
					await fs.writeTextFile(summaryPath, getText(llmSegments, 'srt'))
				}
				localIndex += 1
				await new Promise((resolve) => setTimeout(resolve, 100))
				setCurrentIndex(localIndex)
			} catch (error) {
				stopKeepAwake()
				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
					source: 'batch',
					error_message: String(error),
				})
				if (isAbortingRef.current) {
					navigate('/')
				} else {
					console.error(`error while transcribe ${file.name}: `, error)
				}
				localIndex += 1
				setCurrentIndex(localIndex)
			}
		}
		stopKeepAwake()
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
		formats,
		setFormats,
		preference: preference,
	}
}
