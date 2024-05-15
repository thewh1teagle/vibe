import '@fontsource/roboto'
import { event, path } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '../../assets/success.mp3'
import { LocalModelArgs } from '../../components/Params'
import { ErrorModalContext } from '../../providers/ErrorModalProvider'
import * as transcript from '../../lib/transcript'
import { UpdaterContext } from '../../providers/UpdaterProvider'
import * as webview from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { ls, validPath } from '../../lib/utils'
import { useNavigate } from 'react-router-dom'
import * as fs from '@tauri-apps/plugin-fs'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import * as os from '@tauri-apps/plugin-os'

export function useTranscribeViewModel() {
    const [settingsVisible, setSettingsVisible] = useState(false)
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const abortRef = useRef<boolean>(false)
    const [segments, setSegments] = useState<transcript.Segment[] | null>(null)

    const [lang, setLang] = useLocalStorage('lang', 'en')
    const [progress, setProgress] = useState<number | undefined>()
    const [audioPath, setAudioPath] = useState<string>()
    const [modelPath, setModelPath] = useLocalStorage<string | null>('model_path', null)
    const audioRef = useRef<HTMLAudioElement>()
    const { updateApp, availableUpdate } = useContext(UpdaterContext)
    const { setState: setErrorModal } = useContext(ErrorModalContext)
    const [args, setArgs] = useLocalStorage<LocalModelArgs>('model_args', {
        init_prompt: '',
        verbose: false,
        lang,
        n_threads: 4,
        temperature: 0.4,
    })
    const [soundOnFinish, _setSoundOnFinish] = useLocalStorage('sound_on_finish', true)
    const [focusOnFinish, _setFocusOnFinish] = useLocalStorage('focus_on_finish', true)

    async function handleEvents() {
        await listen('transcribe_progress', (event) => {
            const value = event.payload as number
            if (value >= 0 && value <= 100) {
                setProgress(value)
            }
        })
        await listen('new_segment', (event) => {
            const payload = event.payload as any
            const segment: transcript.Segment = { start: payload.start, stop: payload.end, text: payload.text }
            setSegments((prev) => (prev ? [...prev, segment] : [segment]))
        })
    }

    async function onAbort() {
        abortRef.current = true
        event.emit('abort_transcribe')
    }

    async function checkModelExists() {
        try {
            const configPath = await path.appLocalDataDir()

            const entries = await ls(configPath)

            const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
            if (filtered.length === 0) {
                // if not models found download new one
                navigate('/setup')
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
        event.listen('tauri://drop', (event) => {
            const payload: any = event.payload
            const newPath = payload?.paths?.[0] as string
            if (newPath && validPath(newPath)) {
                // take first path
                setAudioPath(newPath)
            }
        })
    }

    async function handleDeepLinks() {
        const platform = await os.platform()
        if (platform === 'macos') {
            await onOpenUrl((urls) => {
                for (let url of urls) {
                    if (url.startsWith('file://')) {
                        url = decodeURIComponent(url)
                        url = url.replace('file://', '')
                        // take only the first one
                        setAudioPath(url)
                        break
                    }
                }
            })
        }
        else if (platform == 'windows' || platform == 'linux') {
            const urls: string[] = await invoke('get_deeplinks')
            for (const url of urls) {
                setAudioPath(url)
            }
        }
    }

    useEffect(() => {
        handleDrop()
        handleDeepLinks()
        checkModelExists()
        handleEvents()
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
            const res: transcript.Transcript = await invoke('transcribe', { options: { ...args, model: modelPath, path: audioPath, lang } })
            setSegments(res.segments)
        } catch (e: any) {
            if (!abortRef.current) {
                console.error('error: ', e)
                setErrorModal?.({ log: e.toString(), open: true })
                setLoading(false)
            }
        } finally {
            setLoading(false)
            setProgress(undefined)
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
