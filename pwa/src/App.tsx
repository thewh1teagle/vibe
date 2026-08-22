import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, HardDriveDownload, Mic, QrCode, RefreshCw, RotateCcw, Settings, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { InstallHint } from '~/components/install-hint'
import { OutboxCard } from '~/components/outbox-card'
import { SettingsSheet } from '~/components/settings-sheet'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import {
	basename,
	clearPeer,
	fetchCapabilities,
	getClient,
	LANG_KEY,
	loadPeer,
	normalizeEvent,
	parsePairingHash,
	savePeer,
	truncateId,
	type Capabilities,
	type HandoffError,
	type HandoffEvent,
	type Peer,
} from '~/lib/handoff'
import { languageLabel } from '~/lib/languages'
import { canRecord, filenameFor, formatDuration, formatSize, pickMimeType } from '~/lib/recorder'
import { cn } from '~/lib/style'
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

type Phase = 'idle' | 'recording' | 'sending' | 'done' | 'failed'

/** How long to wait for the desktop after the page returns to the foreground. */
const STALL_GRACE_MS = 20_000

interface Failure {
	code: string
	message: string
}

export function App() {
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
	const [settingsOpen, setSettingsOpen] = useState(false)

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
				toast.success('Paired with your desktop')
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
				message:
					'The connection to your desktop dropped while the app was in the background. Your recording is still here — send it again.',
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

	const send = useCallback(async (entryId: string) => {
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
			setStatus(`Sending ${formatSize(bytes.length)}…`)

			const stream = client.send_recording(currentPeer.endpointId, currentPeer.token, filename, mime, wireLang, false, bytes)
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
						// Loading a large model into Sona takes tens of seconds and reports
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
						setStatus(
							typeof event.processingTimeSec === 'number' ? `Transcribed in ${Math.round(event.processingTimeSec)}s.` : 'Transcribed.'
						)
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
	}, [refreshOutbox, release, acquire, clearStallTimer])

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
		setSettingsOpen(false)
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

	/* ----------------------------------------------------------- render --- */

	if (!secure) return <Shell>{<InsecureNotice />}</Shell>
	if (!peer) return <Shell>{<UnpairedNotice />}</Shell>

	const recording = phase === 'recording'
	const busy = phase === 'sending'
	const hasRecording = blobRef.current !== null

	// Recording is gated on the desktop being ready, and on having a language
	// when the loaded model cannot detect one for itself.
	const modelLoaded = capabilities?.modelLoaded ?? false
	const maxBytes = capabilities?.maxAudioBytes ?? 0
	const needsExplicitLang = !!capabilities && !capabilities.languageDetection && !lang
	const ready = recordable && modelLoaded && !needsExplicitLang
	const langSummary = lang ? languageLabel(lang) : 'Auto-detect'

	return (
		<Shell
			onSettings={() => setSettingsOpen(true)}
			badge={
				<Badge variant="secondary" className="font-mono text-[10px] font-normal">
					{truncateId(peer.endpointId)}
				</Badge>
			}>
			{!recordable && (
				<Card className="mb-4 border-destructive/40">
					<CardContent className="pt-6 text-sm text-muted-foreground">
						This browser has no <code className="font-mono">MediaRecorder</code>, so it cannot record audio. Use Safari 17+ or Chrome.
					</CardContent>
				</Card>
			)}

			{capabilitiesLoading && (
				<Card className="stagger-in mb-4">
					<CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
						<Spinner className="size-4" />
						<span>Asking your desktop what it can do…</span>
					</CardContent>
				</Card>
			)}

			{!capabilitiesLoading && capabilitiesError && (
				<Card className="stagger-in mb-4 border-destructive/40">
					<CardContent className="space-y-3 pt-6">
						<div className="flex items-center gap-2 text-destructive">
							<AlertTriangle className="size-4" />
							<span className="eyebrow text-destructive">{capabilitiesError.code}</span>
						</div>
						<p className="text-sm">{capabilitiesError.message}</p>
						{capabilitiesError.code === 'unauthorized' ? (
							<>
								<p className="text-sm text-muted-foreground">
									This pairing is no longer valid — the desktop has a new token. Unpair and scan the QR code again.
								</p>
								<Button variant="destructive" className="h-12 w-full" onClick={onUnpair}>
									Unpair and rescan
								</Button>
							</>
						) : (
							<Button variant="outline" className="h-12 w-full" onClick={() => void refreshCapabilities(peer)}>
								<RefreshCw />
								Try again
							</Button>
						)}
					</CardContent>
				</Card>
			)}

			{!capabilitiesLoading && capabilities && !capabilities.modelLoaded && (
				<Card className="stagger-in mb-4">
					<CardContent className="space-y-3 pt-6">
						<h2 className="text-base font-semibold">No model loaded</h2>
						<p className="text-sm text-muted-foreground">
							Load a model in Vibe on your desktop, then re-check. Recording is disabled until then.
						</p>
						<Button variant="outline" className="h-12 w-full" onClick={() => void refreshCapabilities(peer)}>
							<RefreshCw />
							Re-check
						</Button>
					</CardContent>
				</Card>
			)}

			{needsExplicitLang && (
				<Card className="stagger-in mb-4">
					<CardContent className="space-y-3 pt-6">
						<p className="text-sm text-muted-foreground">
							This model cannot detect the spoken language. Choose one before recording.
						</p>
						<Button variant="outline" className="h-12 w-full" onClick={() => setSettingsOpen(true)}>
							Choose a language
						</Button>
					</CardContent>
				</Card>
			)}

			<OutboxCard
				entries={outbox}
				activeId={activeId}
				busy={busy}
				persisted={persisted}
				onSendNow={() => void pumpOutbox()}
				onDelete={(id) => void deleteEntry(id).then(refreshOutbox)}
			/>

			<div className="flex flex-col items-center py-8">
				<button
					type="button"
					disabled={!ready || busy}
					onClick={recording ? stopRecording : () => void startRecording()}
					aria-label={recording ? 'Stop recording' : 'Start recording'}
					className={cn(
						'flex size-44 flex-col items-center justify-center gap-3 rounded-full text-lg font-semibold shadow-lg transition-transform duration-150 active:scale-[0.97] disabled:opacity-50',
						recording ? 'record-pulse bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
					)}>
					{recording ? <Square className="size-9 fill-current" /> : <Mic className="size-10" />}
					<span>{recording ? 'Stop' : 'Record'}</span>
				</button>

				<div className="mt-5 h-8 text-3xl font-semibold tabular-nums">{recording ? formatDuration(elapsed) : ''}</div>
				{recording && sizeWarning && maxBytes > 0 && (
					<p className="mt-1 text-center text-xs text-destructive">
						Approaching your desktop's {formatSize(maxBytes)} limit — recording will stop there.
					</p>
				)}
				<p className="text-sm text-muted-foreground">{recording ? 'Keep this screen open.' : 'Tap to record, tap again to send.'}</p>

				{capabilities?.modelLoaded && (
					<p className="mt-3 text-center text-xs text-muted-foreground">
						{langSummary}
						{capabilities.modelName && (
							<>
								{' · '}
								<code className="font-mono">{capabilities.modelName}</code>
							</>
						)}
					</p>
				)}
			</div>

			{(busy || status || uploadPct !== null || failure) && (
				<Card className="stagger-in mb-4">
					<CardContent className="space-y-4 pt-6">
						{status && (
							<div className="flex items-center gap-2 text-sm">
								{busy && <Spinner className="size-4" />}
								<span>{status}</span>
							</div>
						)}

						{busy && <p className="text-xs text-muted-foreground">Keep this screen open until the transcript arrives.</p>}

						{uploadPct !== null && <Meter label="Upload" value={uploadPct} />}
						{loadingModel && <IndeterminateMeter label="Loading model" />}
						{transcribePct !== null && <Meter label="Transcribing" value={transcribePct} />}

						{failure && (
							<div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
								<div className="mb-1 flex items-center gap-2 text-destructive">
									<AlertTriangle className="size-4" />
									<span className="eyebrow text-destructive">{failure.code}</span>
								</div>
								<p className="text-sm">{failure.message}</p>
							</div>
						)}

						{phase === 'done' && savedPath && (
							<div className="flex items-start gap-2 text-xs text-muted-foreground">
								<HardDriveDownload className="mt-0.5 size-3.5 shrink-0" />
								<span>
									Saved on your desktop as <code className="font-mono break-all">{basename(savedPath)}</code>
								</span>
							</div>
						)}

						{(failure || phase === 'done') && (
							<div className="flex flex-wrap gap-2">
								{failure && hasRecording && (
									<Button className="h-12 flex-1" onClick={() => void pumpOutbox()}>
										<RotateCcw />
										Retry send
									</Button>
								)}
								<Button variant="outline" className="h-12 flex-1" onClick={onDiscard}>
									<Trash2 />
									Discard
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{transcript && (
				<Card className="stagger-in mb-4">
					<CardContent className="pt-6">
						<div className="mb-3 flex items-center justify-between">
							<span className="eyebrow">Transcript</span>
							<Button variant="ghost" size="sm" onClick={() => void onCopy()}>
								{copied ? <Check /> : <Copy />}
								{copied ? 'Copied' : 'Copy'}
							</Button>
						</div>
						<p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{transcript}</p>
					</CardContent>
				</Card>
			)}

			<InstallHint variant="subtle" />

			<SettingsSheet
				open={settingsOpen}
				endpointId={peer.endpointId}
				capabilities={capabilities}
				lang={lang}
				onLangChange={onLangChange}
				onUnpair={onUnpair}
				onClose={() => setSettingsOpen(false)}
			/>
		</Shell>
	)
}

function Meter({ label, value }: { label: string; value: number }) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{label}</span>
				<span className="tabular-nums">{value}%</span>
			</div>
			<Progress value={value} className="progress-aurora h-2" />
		</div>
	)
}

/** For work with no reportable percentage — the desktop loading a model. */
function IndeterminateMeter({ label }: { label: string }) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{label}</span>
				<span>this can take a while</span>
			</div>
			<div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
				<div className="aurora-bar handoff-sweep h-full w-1/3 rounded-full" />
			</div>
		</div>
	)
}

function Shell({ children, onSettings, badge }: { children: React.ReactNode; onSettings?: () => void; badge?: React.ReactNode }) {
	return (
		<div className="safe-bottom mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
			<header className="safe-top flex items-center justify-between pb-2">
				<div className="flex items-center gap-2">
					<h1 className="text-base font-semibold tracking-tight">Vibe Phone</h1>
					{badge}
				</div>
				{onSettings && (
					<Button variant="ghost" size="icon" onClick={onSettings} aria-label="Settings">
						<Settings />
					</Button>
				)}
			</header>
			<main className="flex-1">{children}</main>
		</div>
	)
}

function UnpairedNotice() {
	return (
		<div className="mt-10 space-y-4">
			<Card className="stagger-in">
				<CardContent className="flex flex-col items-center gap-4 py-10 text-center">
					<div className="aurora flex size-20 items-center justify-center rounded-2xl">
						<QrCode className="size-9" />
					</div>
					<div>
						<h2 className="text-lg font-semibold">Not paired yet</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Scan the QR code in Vibe &rarr; Settings &rarr; Phone to link this device to your desktop.
						</p>
						<p className="mt-3 text-xs text-muted-foreground">
							Paired before and seeing this? Scanning the QR code again is all it takes — it re-pairs in one step.
						</p>
					</div>
				</CardContent>
			</Card>
			<InstallHint variant="pre-pairing" />
		</div>
	)
}

function InsecureNotice() {
	return (
		<Card className="stagger-in mt-10 border-destructive/40">
			<CardContent className="flex flex-col gap-3 py-8">
				<div className="flex items-center gap-2 text-destructive">
					<AlertTriangle className="size-5" />
					<h2 className="text-base font-semibold">Insecure connection</h2>
				</div>
				<p className="text-sm text-muted-foreground">
					Microphone access needs HTTPS or <code className="font-mono">localhost</code>. This page was served over plain HTTP from{' '}
					<code className="font-mono break-all">{location.origin}</code>, so recording is disabled.
				</p>
				<p className="text-sm text-muted-foreground">
					Open it on the desktop at <code className="font-mono">http://localhost:8088</code>, or put the app behind HTTPS (or a tunnel)
					before testing on a phone.
				</p>
			</CardContent>
		</Card>
	)
}
