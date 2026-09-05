/**
 * The phone's whole handoff state machine: pairing, what the desktop can do,
 * the durable outbox, recording, and one send attempt end to end.
 *
 * It lives apart from `App.tsx` so the component is only markup. Everything
 * here is behaviour that has to survive a backgrounded tab, a dropped relay
 * connection, and a browser that suspends the microphone without warning.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
	clearPeer,
	fetchCapabilities,
	getClient,
	LANG_KEY,
	loadPeer,
	normalizeEvent,
	parsePairingHash,
	resolvePeer,
	savePeer,
	type Capabilities,
	type HandoffError,
	type HandoffEvent,
	type Peer,
} from '~/lib/handoff'
import { canRecord, filenameFor, formatSize, pickMimeType } from '~/lib/recorder'
import {
	addRecording,
	blobFor,
	deleteEntry,
	getEntry,
	isStoragePersisted,
	listOutbox,
	markAttempt,
	OutboxFullError,
	requestPersistentStorage,
	type OutboxSummary,
} from '~/lib/outbox'
import { useWakeLock } from '~/lib/use-wake-lock'

export type Phase = 'idle' | 'recording' | 'sending' | 'done' | 'failed'

export interface Failure {
	code: string
	message: string
}

/** How long to wait for the desktop after the page returns to the foreground. */
const STALL_GRACE_MS = 20_000

export function useHandoffSession() {
	const [peer, setPeer] = useState<Peer | null>(null)
	const [lang, setLang] = useState('')
	const [phase, setPhase] = useState<Phase>('idle')
	const [elapsed, setElapsed] = useState(0)
	const [status, setStatus] = useState('')
	const [uploadPct, setUploadPct] = useState<number | null>(null)
	const [transcribePct, setTranscribePct] = useState<number | null>(null)
	const [transcript, setTranscript] = useState('')
	const [failure, setFailure] = useState<Failure | null>(null)
	const [copied, setCopied] = useState(false)
	const [savedPath, setSavedPath] = useState<string | null>(null)
	const [sizeWarning, setSizeWarning] = useState(false)
	const [loadingModel, setLoadingModel] = useState(false)
	// Durable queue of recordings that the desktop has not confirmed yet.
	const [outbox, setOutbox] = useState<OutboxSummary[]>([])
	const [persisted, setPersisted] = useState(true)
	const [activeId, setActiveId] = useState<string | null>(null)

	// What the desktop says it can do. Never assumed locally.
	const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
	const [capabilitiesError, setCapabilitiesError] = useState<HandoffError | null>(null)
	const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)

	const recorderRef = useRef<MediaRecorder | null>(null)
	const chunksRef = useRef<BlobPart[]>([])
	const bytesRef = useRef(0)
	const blobRef = useRef<Blob | null>(null)
	const segmentsRef = useRef<string[]>([])
	const sendingRef = useRef(false)
	const langRef = useRef('')
	const maxBytesRef = useRef(0)
	const peerRef = useRef<Peer | null>(null)
	const startedAtRef = useRef(0)
	// Last time the desktop said anything, used to notice a dropped relay.
	const lastEventAtRef = useRef(0)
	const stallTimerRef = useRef<number | null>(null)
	const abandonedRef = useRef(false)

	const { acquire, release, reacquireIfWanted } = useWakeLock()

	langRef.current = lang
	peerRef.current = peer
	maxBytesRef.current = capabilities?.maxAudioBytes ?? 0

	const secure = typeof window !== 'undefined' && window.isSecureContext
	const recordable = canRecord()

	/* ---------------------------------------------------------- pairing --- */

	useEffect(() => {
		const adopt = () => {
			const fromHash = parsePairingHash(location.hash)
			if (fromHash) {
				savePeer(fromHash)
				setPeer(fromHash)
				// The pairing now lives only in localStorage; ask the browser to keep it.
				void requestPersistentStorage()
				// Drop the token from the address bar so it does not linger in history.
				history.replaceState(null, '', location.pathname + location.search)
				return true
			}
			return false
		}

		if (!adopt()) setPeer(loadPeer())

		try {
			setLang(localStorage.getItem(LANG_KEY) ?? '')
		} catch {
			/* private mode */
		}

		const onHashChange = () => adopt()
		window.addEventListener('hashchange', onHashChange)
		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	/* ----------------------------------------------------- capabilities --- */

	const refreshCapabilities = useCallback(async (target: Peer) => {
		setCapabilitiesLoading(true)
		setCapabilitiesError(null)
		const result = await fetchCapabilities(target)
		if (result.type === 'error') {
			setCapabilities(null)
			setCapabilitiesError(result)
		} else {
			setCapabilities(result)
			// A language saved from an earlier model may not exist on this one.
			setLang((current) => {
				if (!current) return current
				if (result.languages.includes(current)) return current
				try {
					localStorage.removeItem(LANG_KEY)
				} catch {
					/* private mode */
				}
				return ''
			})
		}
		setCapabilitiesLoading(false)
	}, [])

	useEffect(() => {
		if (!peer || !secure) return
		void refreshCapabilities(peer)
	}, [peer, secure, refreshCapabilities])

	/* ------------------------------------------------------------ timer --- */

	useEffect(() => {
		if (phase !== 'recording') return
		const id = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200)
		return () => window.clearInterval(id)
	}, [phase])

	/* -------------------------------------------------- stall watchdog --- */

	const clearStallTimer = useCallback(() => {
		if (stallTimerRef.current !== null) {
			window.clearTimeout(stallTimerRef.current)
			stallTimerRef.current = null
		}
	}, [])

	/**
	 * The transcript arrives over a single live stream with no resume in the
	 * protocol. If the phone was backgrounded long enough for the relay
	 * connection to die, the read below simply never resolves — a silent hang.
	 * So after the page comes back, give the desktop a grace period and, if
	 * nothing arrives, say so and offer the retry (the audio is still in memory).
	 */
	const armStallTimer = useCallback(() => {
		clearStallTimer()
		const resumedAt = Date.now()
		stallTimerRef.current = window.setTimeout(() => {
			stallTimerRef.current = null
			if (!sendingRef.current || lastEventAtRef.current >= resumedAt) return
			abandonedRef.current = true
			sendingRef.current = false
			release()
			setLoadingModel(false)
			setStatus('')
			setFailure({
				code: 'connection_lost',
				message: 'The connection to your desktop dropped while the app was in the background. Your recording is still here — send it again.',
			})
			setPhase('failed')
		}, STALL_GRACE_MS)
	}, [clearStallTimer, release])

	/* ------------------------------------------------------------- send --- */

	const refreshOutbox = useCallback(async () => {
		try {
			const [entries, persistedNow] = await Promise.all([listOutbox(), isStoragePersisted()])
			setOutbox(entries)
			setPersisted(persistedNow)
		} catch {
			/* storage unavailable; the in-memory path still works */
		}
	}, [])

	const send = useCallback(
		async (entryId: string) => {
			const currentPeer = peerRef.current
			if (!currentPeer || sendingRef.current) return

			const entry = await getEntry(entryId)
			if (!entry) {
				await refreshOutbox()
				return
			}
			const blob = blobFor(entry)
			blobRef.current = blob

			// Refuse an upload the desktop is going to reject on arrival — no point
			// burning cellular data on it. A missing or zero cap means "unknown".
			const cap = maxBytesRef.current
			if (cap > 0 && blob.size > cap) {
				release()
				setFailure({
					code: 'too_large',
					message: `This recording is ${formatSize(blob.size)}, over your desktop's ${formatSize(cap)} limit. It was not uploaded — record a shorter take.`,
				})
				setPhase('failed')
				setStatus('')
				return
			}

			sendingRef.current = true
			abandonedRef.current = false
			lastEventAtRef.current = Date.now()
			// Retry starts an operation with no recording in progress, so take the
			// lock here too; acquire() is idempotent when we already hold it.
			void acquire()
			segmentsRef.current = []
			setTranscript('')
			setFailure(null)
			setUploadPct(0)
			setTranscribePct(null)
			setSavedPath(null)
			setLoadingModel(false)
			setActiveId(entryId)
			setPhase('sending')
			setStatus('Connecting to your desktop…')

			const mime = entry.mime || blob.type || 'application/octet-stream'
			const filename = entry.filename
			// The language chosen when the recording was made travels with it, so a
			// queued recording is not retried under a language picked later.
			const wireLang = entry.lang

			try {
				const client = await getClient()
				const bytes = new Uint8Array(await blob.arrayBuffer())
				const authorized = await resolvePeer(client, currentPeer)
				setStatus(`Sending ${formatSize(bytes.length)}…`)

				const stream = client.send_recording(authorized.endpointId, authorized.token, filename, mime, wireLang, false, bytes)
				const reader = stream.getReader()

				for (;;) {
					const { value, done } = await reader.read()
					if (done) break
					const event = normalizeEvent(value) as HandoffEvent | null
					if (!event) continue
					// A stalled operation was already reported to the user; do not
					// resurrect it if the connection limps back to life.
					if (abandonedRef.current) break
					lastEventAtRef.current = Date.now()

					switch (event.type) {
						case 'uploadProgress': {
							const pct = event.total > 0 ? (event.sent / event.total) * 100 : 0
							setUploadPct(Math.min(100, Math.round(pct)))
							break
						}
						case 'accepted':
							setUploadPct(100)
							setStatus('Desktop received it.')
							break
						case 'status':
							// Loading a large model into Server takes tens of seconds and reports
							// no percentage, so show an indeterminate bar rather than a 0% one
							// that reads as a stall. Unknown phases are ignored on purpose.
							if (event.phase === 'loading_model') {
								setLoadingModel(true)
								setTranscribePct(null)
								setStatus('Loading model on your desktop…')
							} else if (event.phase === 'transcribing') {
								setLoadingModel(false)
								setTranscribePct((current) => current ?? 0)
								setStatus('Transcribing…')
							}
							break
						case 'progress':
							setLoadingModel(false)
							setTranscribePct(Math.max(0, Math.min(100, Math.round(Number(event.progress) || 0))))
							break
						case 'segment':
							segmentsRef.current.push(String(event.text ?? ''))
							setTranscript(segmentsRef.current.join(' ').replace(/\s+/g, ' ').trim())
							break
						case 'done':
							release()
							// Confirmed terminal success: the only point at which the
							// recording may be dropped from durable storage.
							void deleteEntry(entryId).then(refreshOutbox)
							setLoadingModel(false)
							if (typeof event.text === 'string') setTranscript(event.text.trim())
							if (typeof event.savedPath === 'string' && event.savedPath) setSavedPath(event.savedPath)
							setTranscribePct(100)
							setPhase('done')
							setStatus(typeof event.processingTimeSec === 'number' ? `Transcribed in ${Math.round(event.processingTimeSec)}s.` : 'Transcribed.')
							break
						case 'error':
							release()
							void markAttempt(entryId, event.message).then(refreshOutbox)
							setLoadingModel(false)
							setFailure({ code: event.code || 'error', message: event.message || 'The desktop reported an error.' })
							setPhase('failed')
							setStatus('')
							break
						default:
							break
					}
				}

				// Stream ended without a terminal event.
				setPhase((current) => {
					if (current !== 'sending') return current
					setFailure({ code: 'incomplete', message: 'The desktop closed the connection before finishing.' })
					return 'failed'
				})
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				void markAttempt(entryId, message).then(refreshOutbox)
				setFailure({ code: 'transport', message })
				setPhase('failed')
				setStatus('')
			} finally {
				sendingRef.current = false
				setActiveId(null)
				clearStallTimer()
				// Backstop: covers the transport catch, a stream that ends without a
				// terminal event, and any path the cases above missed.
				release()
				void refreshOutbox()
			}
		},
		[refreshOutbox, release, acquire, clearStallTimer],
	)

	/**
	 * Attempt the oldest pending recording. Deliberately sequential and
	 * re-entrancy guarded: two sends would fight over one relay connection.
	 *
	 * Background Sync would be the natural home for this, but Safari/iOS does
	 * not implement it, and a retry path that only ever fires on Android would
	 * mean two different behaviours to reason about. So retries are driven by
	 * events the phone actually gets: app open, return to foreground, and the
	 * network coming back.
	 */
	const pumpOutbox = useCallback(async () => {
		if (sendingRef.current || recorderRef.current) return
		if (!peerRef.current) return
		try {
			const entries = await listOutbox()
			if (entries.length === 0) return
			await send(entries[0].id)
		} catch {
			/* storage unavailable */
		}
	}, [send])

	/* ----------------------------------------------------------- outbox --- */

	// On open: show what is queued immediately, then try to drain it.
	useEffect(() => {
		if (!peer) return
		let cancelled = false
		void (async () => {
			await refreshOutbox()
			if (!cancelled) void pumpOutbox()
		})()
		return () => {
			cancelled = true
		}
	}, [peer, refreshOutbox, pumpOutbox])

	// Retry when the network returns.
	useEffect(() => {
		const onOnline = () => void pumpOutbox()
		window.addEventListener('online', onOnline)
		return () => window.removeEventListener('online', onOnline)
	}, [pumpOutbox])

	/* -------------------------------------------------------- recording --- */

	const startRecording = useCallback(async () => {
		setFailure(null)
		setTranscript('')
		setStatus('')
		setUploadPct(null)
		setTranscribePct(null)
		setSavedPath(null)
		setSizeWarning(false)
		blobRef.current = null
		chunksRef.current = []
		bytesRef.current = 0

		let stream: MediaStream
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true })
		} catch (err) {
			setFailure({ code: 'microphone', message: err instanceof Error ? err.message : String(err) })
			setPhase('failed')
			return
		}

		const preferred = pickMimeType()
		let recorder: MediaRecorder
		try {
			recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
		} catch {
			recorder = new MediaRecorder(stream)
		}

		recorderRef.current = recorder

		recorder.ondataavailable = (event) => {
			if (!event.data || event.data.size === 0) return
			chunksRef.current.push(event.data)
			bytesRef.current += event.data.size

			// Warn as the recording approaches the desktop's cap, and stop at it
			// rather than letting the user keep talking into an upload that would
			// be refused on arrival.
			const limit = maxBytesRef.current
			if (limit > 0) {
				if (bytesRef.current >= limit) {
					toast.warning('Size limit reached', {
						description: `Your desktop accepts at most ${formatSize(limit)}. Sending what was recorded so far.`,
					})
					if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
				} else if (bytesRef.current >= limit * 0.8) {
					setSizeWarning(true)
				}
			}
		}

		recorder.onstop = () => {
			for (const track of stream.getTracks()) track.stop()
			// The lock is deliberately NOT released here: the upload and the
			// desktop's transcription still have to happen, and that is exactly
			// when the screen must not sleep.
			const first = chunksRef.current[0]
			const type = (first instanceof Blob ? first.type : '') || recorder.mimeType || preferred || 'application/octet-stream'
			const blob = new Blob(chunksRef.current, { type })
			chunksRef.current = []
			recorderRef.current = null
			blobRef.current = blob
			if (blob.size === 0) {
				release()
				setFailure({ code: 'empty', message: 'Nothing was captured. Check the microphone permission and try again.' })
				setPhase('failed')
				return
			}

			// A recording the desktop can never accept should not be queued
			// forever; say so instead of silently hoarding it.
			const cap = maxBytesRef.current
			if (cap > 0 && blob.size > cap) {
				release()
				setFailure({
					code: 'too_large',
					message: `This recording is ${formatSize(blob.size)}, over your desktop's ${formatSize(cap)} limit. It was not saved or uploaded — record a shorter take.`,
				})
				setPhase('failed')
				setStatus('')
				return
			}

			// Write to durable storage BEFORE the first send attempt, so a crash
			// or a closed tab mid-upload still leaves the recording recoverable.
			void (async () => {
				setStatus('Saving recording…')
				try {
					const summary = await addRecording({ blob, filename: filenameFor(type), mime: type, lang: langRef.current || null })
					await refreshOutbox()
					await send(summary.id)
				} catch (err) {
					release()
					const full = err instanceof OutboxFullError
					setFailure({
						code: full ? 'outbox_full' : 'storage',
						message: full
							? err.message
							: `The recording could not be saved on this device: ${err instanceof Error ? err.message : String(err)}. It is still in memory — do not close this tab.`,
					})
					setPhase('failed')
					setStatus('')
					await refreshOutbox()
				}
			})()
		}

		recorder.onerror = () => {
			release()
			setFailure({ code: 'recorder', message: 'The browser stopped the recording unexpectedly.' })
			setPhase('failed')
		}

		recorder.start(1000)
		startedAtRef.current = Date.now()
		setElapsed(0)
		setPhase('recording')
		void acquire()
	}, [acquire, release, send, refreshOutbox])

	const stopRecording = useCallback(() => {
		const recorder = recorderRef.current
		if (recorder && recorder.state !== 'inactive') recorder.stop()
	}, [])

	// Backgrounding means two different things depending on where we are.
	//
	// While RECORDING: iOS suspends the microphone, silently truncating the
	// capture, so stop cleanly and say why.
	//
	// While SENDING: the audio has left the phone and the desktop keeps working
	// regardless — but the transcript comes back over one live stream that
	// cannot be resumed, so a long suspension loses it. We cannot reconnect, so
	// we warn plainly, and on return re-take the wake lock and watch for a
	// stream that never speaks again.
	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				if (recorderRef.current) {
					stopRecording()
					toast.warning('Recording stopped', {
						description: 'iOS suspends the microphone when the app is not on screen, so we sent what we had.',
					})
				} else if (sendingRef.current) {
					toast.warning('Keep this screen open', {
						description: 'The transcript is arriving over a live connection. Leaving the app can drop it.',
					})
				}
				return
			}

			// Back on screen: the spec dropped our lock, so take it back.
			reacquireIfWanted()
			if (sendingRef.current) armStallTimer()
			else void pumpOutbox()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => document.removeEventListener('visibilitychange', onVisibility)
	}, [stopRecording, reacquireIfWanted, armStallTimer, pumpOutbox])

	/* ---------------------------------------------------------- actions --- */

	const onCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(transcript)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1600)
		} catch {
			toast.error('Could not copy', { description: 'Select the text and copy it manually.' })
		}
	}, [transcript])

	const onDiscard = useCallback(() => {
		// Stopping and discarding without sending must not leave the screen awake.
		release()
		clearStallTimer()
		abandonedRef.current = true
		if (activeId) void deleteEntry(activeId).then(refreshOutbox)
		blobRef.current = null
		segmentsRef.current = []
		setTranscript('')
		setFailure(null)
		setStatus('')
		setUploadPct(null)
		setTranscribePct(null)
		setSavedPath(null)
		setSizeWarning(false)
		setLoadingModel(false)
		setActiveId(null)
		setPhase('idle')
	}, [activeId, refreshOutbox, release, clearStallTimer])

	const onUnpair = useCallback(() => {
		clearPeer()
		setPeer(null)
		setCapabilities(null)
		setCapabilitiesError(null)
		onDiscard()
	}, [onDiscard])

	const onLangChange = useCallback((value: string) => {
		setLang(value)
		try {
			if (value) localStorage.setItem(LANG_KEY, value)
			else localStorage.removeItem(LANG_KEY)
		} catch {
			/* private mode */
		}
	}, [])

	/** Drop a queued recording the user does not want to send. */
	const discardQueued = useCallback(
		(id: string) => {
			void deleteEntry(id).then(refreshOutbox)
		},
		[refreshOutbox],
	)

	return {
		// Environment
		secure,
		recordable,
		// Pairing and desktop capabilities
		peer,
		capabilities,
		capabilitiesError,
		capabilitiesLoading,
		refreshCapabilities,
		// Recording and transfer
		phase,
		elapsed,
		status,
		uploadPct,
		transcribePct,
		loadingModel,
		sizeWarning,
		transcript,
		savedPath,
		failure,
		activeId,
		// `blobRef` is read during render on purpose: it is set before the state
		// change that re-renders, so this is always the current answer.
		hasRecording: blobRef.current !== null,
		startRecording,
		stopRecording,
		// Outbox
		outbox,
		persisted,
		pumpOutbox,
		discardQueued,
		// Language
		lang,
		onLangChange,
		// Actions
		copied,
		onCopy,
		onDiscard,
		onUnpair,
	}
}
