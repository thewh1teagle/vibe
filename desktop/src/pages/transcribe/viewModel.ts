import '@fontsource/roboto'
import { event, path } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import * as webview from '@tauri-apps/api/webviewWindow'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import * as fs from '@tauri-apps/plugin-fs'
import * as os from '@tauri-apps/plugin-os'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '~/assets/success.mp3'
import { LocalModelArgs } from '~/components/Params'
import * as transcript from '~/lib/transcript'
import { NamedPath, ls, pathToNamedPath, validPath } from '~/lib/utils'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { UpdaterContext } from '~/providers/Updater'

export function viewModel() {
	const location = useLocation()
	const [settingsVisible, setSettingsVisible] = useState(location.hash === '#settings')
	const navigate = useNavigate()
	const [loading, setLoading] = useState(false)
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [isManualInstall, _setIsManualInstall] = useLocalStorage('isManualInstall', false)

	const [lang, setLang] = useLocalStorage('transcribe_lang_code', 'en')
	const [progress, setProgress] = useState<number | null>(0)
	const [audioPath, setAudioPath] = useState<NamedPath | null>(null)
	const [modelPath, setModelPath] = useLocalStorage<string | null>('model_path', null)
	const audioRef = useRef<HTMLAudioElement>(null)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [soundOnFinish, _setSoundOnFinish] = useLocalStorage('sound_on_finish', true)
	const [focusOnFinish, _setFocusOnFinish] = useLocalStorage('focus_on_finish', true)

	// Model args
	const [args, setArgs] = useLocalStorage<LocalModelArgs>('model_args', {
		init_prompt: '',
		verbose: false,
		lang,
		n_threads: 4,
		temperature: 0.4,
	})

	async function handleNewSegment() {
		await listen('transcribe_progress', (event) => {
			const value = event.payload as number
			if (value >= 0 && value <= 100) {
				setProgress(value)
			}
		})
		await listen<transcript.Segment>('new_segment', (event) => {
			const { payload } = event
			setSegments((prev) => (prev ? [...prev, payload] : [payload]))
		})
	}

	async function onAbort() {
		setIsAborting(true)
		abortRef.current = true
		event.emit('common.abort_transcribe')
	}

	async function checkModelExists() {
		try {
			const configPath = await path.appLocalDataDir()
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				// Download new model if no models and it's not manual installation
				if (!isManualInstall) {
					navigate('/setup')
				}
			} else {
				if (!modelPath || !(await fs.exists(modelPath))) {
					// if model path not found set another one as default
					const absPath = await path.join(configPath, filtered[0].name)
					setModelPath(absPath)
				}
			}
		} catch (e) {
			console.error(e)
			navigate('/setup')
		}
	}

	async function handleDrop() {
		event.listen<{ paths: string[] }>('tauri://drop', async (event) => {
			const newPathString = event.payload?.paths?.[0] as string
			const newPath = await path.resolve(newPathString)
			if (newPath && validPath(newPath)) {
				// take first path
				setAudioPath(await pathToNamedPath(newPath))
			}
		})
	}

	async function handleDeepLinks() {
		const platform = await os.platform()
		if (platform === 'macos') {
			await onOpenUrl(async (urls) => {
				for (let url of urls) {
					if (url.startsWith('file://')) {
						url = decodeURIComponent(url)
						url = url.replace('file://', '')
						// take only the first one
						setAudioPath(await pathToNamedPath(url))
						break
					}
				}
			})
		} else if (platform == 'windows' || platform == 'linux') {
			const urls: string[] = await invoke('get_deeplinks')
			for (const url of urls) {
				setAudioPath(await pathToNamedPath(url))
			}
		}
	}

	useEffect(() => {
		handleDrop()
		handleDeepLinks()
		checkModelExists()
		handleNewSegment()
	}, [])

	useEffect(() => {
		if (modelPath) {
			localStorage.setItem('model_path', JSON.stringify(modelPath))
		}
	}, [modelPath])

	async function transcribe() {
		setSegments(null)
		setLoading(true)
		try {
			const res: transcript.Transcript = await invoke('transcribe', { options: { ...args, model: modelPath, path: audioPath!.path, lang } })
			setSegments(res.segments)
		} catch (error) {
			if (!abortRef.current) {
				console.error('error: ', error)
				setErrorModal?.({ log: String(error), open: true })
				setLoading(false)
			}
		} finally {
			setLoading(false)
			setIsAborting(false)
			setProgress(null)
			if (!abortRef.current) {
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
	}

	return {
		isAborting,
		settingsVisible,
		setSettingsVisible,
		loading,
		progress,
		audioRef,
		audioPath,
		setAudioPath,
		availableUpdate,
		updateApp,
		segments,
		args,
		setArgs,
		transcribe,
		setLang,
		onAbort,
	}
}
