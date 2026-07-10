import { event } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as ytDlp from '~/lib/ytdlp'
import { ErrorModalContext } from '~/providers/error-modal'
import { useFilesContext } from '~/providers/files-provider'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

export function useAudioDownload(transcribe: (path: string) => Promise<void>) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()
	const { setFiles } = useFilesContext()
	const toast = useToastProvider()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [audioUrl, setAudioUrl] = useState('')
	const [downloadingAudio, setDownloadingAudio] = useState(false)
	const [ytdlpProgress, setYtDlpProgress] = useState<number | null>(null)
	const cancelYtDlpRef = useRef(false)
	const switchingToLinkRef = useRef(false)
	const cachedYtDlpVersion = useRef<string | null | undefined>(undefined)
	const skippedUpdatePromptRef = useRef(false)

	useEffect(() => {
		const unlisten = listen<number>('ytdlp-progress', ({ payload }) => {
			const progress = Math.ceil(payload)
			setYtDlpProgress((current) => (!current || progress > current ? progress : current))
		})
		return () => { unlisten.then((fn) => fn()) }
	}, [])

	async function cancelYtDlpDownload() {
		cancelYtDlpRef.current = true
		event.emit('ytdlp-cancel')
	}

	async function switchToLinkTab() {
		if (switchingToLinkRef.current) return
		switchingToLinkRef.current = true
		try {
			const binaryExists = await ytDlp.exists()
			let latestVersion = cachedYtDlpVersion.current
			if (latestVersion === undefined) {
				try {
					latestVersion = await ytDlp.getLatestVersion()
					cachedYtDlpVersion.current = latestVersion
				} catch (error) {
					console.error('Failed to fetch latest yt-dlp version', error)
					cachedYtDlpVersion.current = null
					if (binaryExists) { preference.setHomeTab('link'); return }
				}
			}

			const needsInstall = !binaryExists
			const needsUpdate = !needsInstall && preference.shouldCheckYtDlpVersion && latestVersion !== null && latestVersion !== preference.ytDlpVersion
			if (needsUpdate && skippedUpdatePromptRef.current) { preference.setHomeTab('link'); return }
			if (!needsInstall && !needsUpdate) { preference.setHomeTab('link'); return }

			const confirmed = needsUpdate
				? await dialog.ask(t('common.ask-for-update-ytdlp-message'), { title: t('common.ask-for-update-ytdlp-title'), kind: 'info', cancelLabel: t('common.later'), okLabel: t('common.update-now') })
				: await dialog.ask(t('common.ask-for-install-ytdlp-message'), { title: t('common.ask-for-install-ytdlp-title'), kind: 'info', cancelLabel: t('common.cancel'), okLabel: t('common.install-now') })

			if (confirmed) {
				try {
					const version = latestVersion ?? preference.ytDlpVersion ?? '2026.02.04'
					toast.setMessage(t('common.downloading-ytdlp')); toast.setProgress(0); toast.setOpen(true)
					await ytDlp.downloadYtDlp(version)
					preference.setYtDlpVersion(version)
					skippedUpdatePromptRef.current = false
					toast.setOpen(false)
					preference.setHomeTab('link')
				} catch (error) {
					console.error(error)
					setErrorModal?.({ log: String(error), open: true })
				}
			} else if (binaryExists) {
				if (needsUpdate) skippedUpdatePromptRef.current = true
				preference.setHomeTab('link')
			}
		} finally {
			switchingToLinkRef.current = false
		}
	}

	async function downloadAudio() {
		if (!audioUrl) return
		setYtDlpProgress(0)
		setDownloadingAudio(true)
		try {
			const outPath = await ytDlp.downloadAudio(audioUrl, preference.storeRecordInDocuments, preference.customRecordingPath)
			if (cancelYtDlpRef.current) { cancelYtDlpRef.current = false; return }
			preference.setHomeTab('file')
			setFiles([{ name: 'audio.m4a', path: outPath }])
			await transcribe(outPath)
		} catch (error) {
			console.error(error)
			setErrorModal?.({ log: String(error), open: true })
		} finally {
			setDownloadingAudio(false)
			setYtDlpProgress(null)
		}
	}

	return { cancelYtDlpRef, cancelYtDlpDownload, ytdlpProgress, setYtDlpProgress, switchToLinkTab, audioUrl, setAudioUrl, downloadAudio, downloadingAudio, setDownloadingAudio }
}
