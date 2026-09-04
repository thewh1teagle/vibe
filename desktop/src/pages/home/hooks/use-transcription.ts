import { event } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import * as webview from '@tauri-apps/api/webviewWindow'
import { useContext, useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import successSound from '~/assets/success.mp3'
import { trackTranscribeCancelled, trackTranscribeFailed, trackTranscribeStarted, trackTranscribeSucceeded } from '~/lib/analytics'
import * as config from '~/lib/config'
import { KEEP_AWAKE, startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { isUserError } from '~/lib/sona-errors'
import * as transcript from '~/lib/transcript'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'

interface UseTranscriptionOptions {
	onResetSummary: () => void
	onSummarize: (segments: transcript.Segment[], prompt: string) => Promise<void>
}

export function useTranscription({ onResetSummary, onSummarize }: UseTranscriptionOptions) {
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const abortRef = useRef(false)
	const [loading, setLoading] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [progress, setProgress] = useState<number | null>(0)

	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	async function onAbort() {
		setIsAborting(true)
		abortRef.current = true
		event.emit('abort_transcribe')
	}

	async function transcribe(path: string) {
		startKeepAwake(KEEP_AWAKE.transcribe)
		setSegments(null)
		onResetSummary()
		setProgress(0)
		setLoading(true)
		abortRef.current = false
		let completedSegments: transcript.Segment[] = []
		trackTranscribeStarted('home', path)

		try {
			const current = preferenceRef.current
			if (!current.modelPath) throw new Error('No model selected. Please download or select a model first.')
			const loadResult = await invoke<string>('load_model', {
				modelPath: current.modelPath,
				gpuDevice: current.gpuDevice,
				noGpu: current.noGpu,
				unloadTimeoutMinutes: current.unloadTimeoutMinutes,
			})
			if (loadResult === 'gpu_fallback') toast.warning(m.gpuFallbackToCpu(), { position: 'bottom-center', duration: 8000 })

			const requiresVad = current.modelMetadata?.capabilities.requires_vad ?? false
			const modelsFolder = current.diarizeEnabled || current.stableTimestampsEnabled || requiresVad ? await invoke<string>('get_models_folder') : null
			const diarizeModel = current.diarizeEnabled ? `${modelsFolder}/${config.diarizeModelFilename}` : undefined
			const vadModel = current.stableTimestampsEnabled || requiresVad ? `${modelsFolder}/${config.vadModelFilename}` : undefined
			const options = {
				path,
				...current.modelOptions,
				...(diarizeModel ? { diarize_model: diarizeModel } : {}),
				...(vadModel ? { vad_model: vadModel } : {}),
				...(current.stableTimestampsEnabled ? { stable_timestamps: true } : {}),
			}
			const startedAt = performance.now()
			const result = await invoke<transcript.Transcript>('transcribe', { options })
			const total = Math.round((performance.now() - startedAt) / 1000)
			console.info(`Transcribe took ${total} seconds.`)
			completedSegments = result.segments
			setSegments(result.segments)
			toast.success(m.transcribeTook({ total: String(total) }), { position: 'bottom-center' })
			// An abort resolves as a success carrying the partial segments, so only this flag tells them apart.
			if (abortRef.current) trackTranscribeCancelled('home', path)
			else trackTranscribeSucceeded('home', { durationSeconds: total, segmentsCount: result.segments.length })
		} catch (error) {
			if (abortRef.current) {
				trackTranscribeCancelled('home', path)
			} else {
				stopKeepAwake(KEEP_AWAKE.transcribe)
				console.error('error: ', error)
				const errorObject = typeof error === 'object' && error !== null ? (error as { code?: string; message?: string }) : null
				const errorMessage = errorObject?.message || String(error)
				const userError = Boolean(errorObject?.code && isUserError(errorObject.code))
				trackTranscribeFailed('home', path, { errorMessage, userError })
				if (userError) {
					toast.error(`${m.error()}: ${errorMessage}`, { position: 'bottom-center' })
				} else {
					setErrorModal?.({ log: errorMessage, open: true })
				}
				setLoading(false)
			}
		} finally {
			stopKeepAwake(KEEP_AWAKE.transcribe)
			setLoading(false)
			setIsAborting(false)
			setProgress(null)
			if (!abortRef.current) {
				if (preferenceRef.current.soundOnFinish) new Audio(successSound).play()
				if (preferenceRef.current.focusOnFinish) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}
		}

		if (completedSegments.length > 0 && preferenceRef.current.llmConfig.enabled) {
			await onSummarize(completedSegments, preferenceRef.current.llmConfig.prompt)
		}
	}

	return { loading, isAborting, segments, setSegments, progress, setProgress, transcribe, onAbort }
}
