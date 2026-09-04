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

/** Where a multi-link download is: which link is being fetched, out of how many. */
export interface DownloadBatch {
	index: number
	total: number
	url: string
}

export function useAudioDownload(transcribe: (paths: string[]) => Promise<void>) {
	const preference = usePreferenceProvider()
	const { setFiles } = useFilesContext()
	const progressToast = useToastProvider()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const [audioUrl, setAudioUrl] = useState('')
	const [downloadingAudio, setDownloadingAudio] = useState(false)
	const [ytdlpProgress, setYtDlpProgress] = useState<number | null>(null)
	const [batch, setBatch] = useState<DownloadBatch | null>(null)
	/** Links waiting under the box, added by pasting several at once or with the add button. */
	const [queuedLinks, setQueuedLinks] = useState<string[]>([])
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

	/** Move the box's text into the list, or the given text; repeats are dropped. */
	function queueLinks(text = audioUrl) {
		const links = ytDlp.parseMediaLinks(text)
		if (!links.length) return
		setQueuedLinks((current) => [...new Set([...current, ...links])])
		setAudioUrl('')
	}

	function removeQueuedLink(url: string) {
		setQueuedLinks((current) => current.filter((link) => link !== url))
	}

	/** Everything a click on Transcribe would fetch: the list, then whatever is still in the box. */
	const pendingLinks = [...new Set([...queuedLinks, ...ytDlp.parseMediaLinks(audioUrl)])]

	/**
	 * Fetch every pending link, then hand all that landed to the queue at once. A link that fails
	 * is skipped, not fatal: the others still download and the skipped ones are listed at the end.
	 * The box and the list are emptied as soon as the run starts so the next links can go in.
	 */
	async function downloadAudio() {
		const urls = pendingLinks
		if (!urls.length) return
		setAudioUrl('')
		setQueuedLinks([])
		cancelYtDlpRef.current = false
		setDownloadingAudio(true)
		const downloaded: string[] = []
		const failed: { url: string; error: unknown }[] = []
		try {
			for (const [index, url] of urls.entries()) {
				if (cancelYtDlpRef.current) break
				setBatch({ index, total: urls.length, url })
				setYtDlpProgress(0)
				try {
					const outPath = await ytDlp.downloadAudio(url)
					// A cancelled download resolves with a file that was never finished.
					if (cancelYtDlpRef.current) break
					downloaded.push(outPath)
				} catch (error) {
					console.error(`download failed for ${url}`, error)
					failed.push({ url, error })
				}
			}
		} finally {
			cancelYtDlpRef.current = false
			setDownloadingAudio(false)
			setYtDlpProgress(null)
			setBatch(null)
		}

		if (downloaded.length) {
			preference.setHomeTab('file')
			setFiles(downloaded.map((path) => ({ name: 'audio.m4a', path })))
			try {
				await transcribe(downloaded)
			} catch (error) {
				console.error(error)
				setErrorModal?.({ log: String(error), open: true })
			}
		}

		if (!failed.length) return
		if (!downloaded.length) {
			setErrorModal?.({ log: failed.map(({ url, error }) => `${url}\n${String(error)}`).join('\n\n'), open: true })
			// A site that stopped working is usually an extractor yt-dlp has already fixed, so this
			// is the moment the update is worth interrupting for — throttle and "later" don't apply.
			void offerYtDlpUpdate(true)
			return
		}
		notify.warning(m.linksSkipped({ count: String(failed.length), total: String(urls.length) }), {
			description: failed.map(({ url }) => url).join('\n'),
			position: 'bottom-center',
			duration: 10000,
		})
	}

	return {
		cancelYtDlpRef,
		cancelYtDlpDownload,
		ytdlpProgress,
		setYtDlpProgress,
		batch,
		switchToLinkTab,
		audioUrl,
		setAudioUrl,
		queuedLinks,
		queueLinks,
		removeQueuedLink,
		pendingLinks,
		downloadAudio,
		downloadingAudio,
		setDownloadingAudio,
	}
}
