import { event } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast as notify } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as ytDlp from '~/lib/ytdlp'
import { ErrorModalContext } from '~/providers/error-modal'
import { useFilesContext } from '~/providers/files-provider'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

/** Used when GitHub cannot be reached and nothing was ever installed — bump it with each release. */
const FALLBACK_YTDLP_VERSION = '2026.08.19'

/** yt-dlp ships almost daily; asking GitHub more often than weekly only produces noise. */
const UPDATE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

export function useAudioDownload(transcribe: (path: string) => Promise<void>) {
	const preference = usePreferenceProvider()
	const { setFiles } = useFilesContext()
	const progressToast = useToastProvider()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [audioUrl, setAudioUrl] = useState('')
	const [downloadingAudio, setDownloadingAudio] = useState(false)
	const [ytdlpProgress, setYtDlpProgress] = useState<number | null>(null)
	const cancelYtDlpRef = useRef(false)
	const switchingToLinkRef = useRef(false)

	useEffect(() => {
		const unlisten = listen<number>('ytdlp-progress', ({ payload }) => {
			const progress = Math.ceil(payload)
			setYtDlpProgress((current) => (!current || progress > current ? progress : current))
		})
		return () => {
			unlisten.then((fn) => fn())
		}
	}, [])

	async function cancelYtDlpDownload() {
		cancelYtDlpRef.current = true
		event.emit('ytdlp-cancel')
	}

	/** Downloads the binary behind the shared progress toast. Returns whether it landed. */
	async function installYtDlp(version: string) {
		try {
			progressToast.setMessage(m.downloadingYtdlp())
			progressToast.setProgress(0)
			progressToast.setOpen(true)
			await ytDlp.downloadYtDlp(version)
			preference.setYtDlpVersion(version)
			// The installed version is by definition not the one that was turned down.
			preference.setYtDlpDeclinedVersion(null)
			preference.setYtDlpLastUpdateCheck(Date.now())
			progressToast.setOpen(false)
			return true
		} catch (error) {
			console.error(error)
			progressToast.setOpen(false)
			setErrorModal?.({ log: String(error), open: true })
			return false
		}
	}

	/**
	 * Offers an update as a passive toast — never a modal, never in the way of the tab switch.
	 * Throttled to one GitHub lookup a week, and silent about a version the user already waved off;
	 * `force` drops both guards for the one case where updating is the actual fix: a failed download.
	 */
	async function offerYtDlpUpdate(force = false) {
		if (!preference.shouldCheckYtDlpVersion) return
		if (!force && Date.now() - preference.ytDlpLastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return

		let latestVersion: string
		try {
			latestVersion = await ytDlp.getLatestVersion()
		} catch (error) {
			console.error('Failed to fetch latest yt-dlp version', error)
			return
		}
		preference.setYtDlpLastUpdateCheck(Date.now())

		if (!ytDlp.isNewerVersion(latestVersion, preference.ytDlpVersion)) return
		if (!force && !ytDlp.isNewerVersion(latestVersion, preference.ytDlpDeclinedVersion)) return

		notify.message(m.ytdlpUpdateAvailable(), {
			description: force ? m.ytdlpUpdateAfterFailure({ version: latestVersion }) : m.ytdlpUpdateAvailableInfo({ version: latestVersion }),
			action: {
				label: m.updateNow(),
				onClick: () => void installYtDlp(latestVersion),
			},
			// Ignoring the toast is an answer too: remember it so this version is only offered once.
			onDismiss: () => preference.setYtDlpDeclinedVersion(latestVersion),
			onAutoClose: () => preference.setYtDlpDeclinedVersion(latestVersion),
		})
	}

	async function switchToLinkTab() {
		if (switchingToLinkRef.current) return
		switchingToLinkRef.current = true
		try {
			// Only a missing binary may hold up the tab — the feature cannot work without it. An
			// update is a background matter, so the tab opens first and the check runs behind it.
			if (await ytDlp.exists()) {
				preference.setHomeTab('link')
				void offerYtDlpUpdate()
				return
			}

			const confirmed = await dialog.ask(m.askForInstallYtdlpMessage(), {
				title: m.askForInstallYtdlpTitle(),
				kind: 'info',
				cancelLabel: m.cancel(),
				okLabel: m.installNow(),
			})
			if (!confirmed) return

			let latestVersion: string | null = null
			try {
				latestVersion = await ytDlp.getLatestVersion()
			} catch (error) {
				console.error('Failed to fetch latest yt-dlp version', error)
			}
			if (await installYtDlp(latestVersion ?? preference.ytDlpVersion ?? FALLBACK_YTDLP_VERSION)) {
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
		let downloaded = false
		try {
			const outPath = await ytDlp.downloadAudio(audioUrl)
			downloaded = true
			if (cancelYtDlpRef.current) {
				cancelYtDlpRef.current = false
				return
			}
			preference.setHomeTab('file')
			setFiles([{ name: 'audio.m4a', path: outPath }])
			await transcribe(outPath)
		} catch (error) {
			console.error(error)
			setErrorModal?.({ log: String(error), open: true })
			// A site that stopped working is usually an extractor yt-dlp has already fixed, so this
			// is the moment the update is worth interrupting for — throttle and "later" don't apply.
			// A transcription that fails afterwards says nothing about yt-dlp, hence the guard.
			if (!downloaded) void offerYtDlpUpdate(true)
		} finally {
			setDownloadingAudio(false)
			setYtDlpProgress(null)
		}
	}

	return {
		cancelYtDlpRef,
		cancelYtDlpDownload,
		ytdlpProgress,
		setYtDlpProgress,
		switchToLinkTab,
		audioUrl,
		setAudioUrl,
		downloadAudio,
		downloadingAudio,
		setDownloadingAudio,
	}
}
