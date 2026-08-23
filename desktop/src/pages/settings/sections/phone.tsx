import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { platform } from '@tauri-apps/plugin-os'
import { Check, Copy, FolderOpen, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { encodeQr } from '~/lib/qr'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { ActionRow, IconAction, SettingsField, SettingsGroup, SettingsNote, SettingsRow, type SettingsViewModel } from './shared'

/**
 * QR codes are read optically, so the colours are hard-coded rather than themed:
 * a dark-on-dark code in dark mode does not scan.
 */
function QrCode({ value, size }: { value: string; size: number }) {
	const matrix = useMemo(() => {
		try {
			return encodeQr(value)
		} catch (error) {
			console.error(error)
			return null
		}
	}, [value])

	if (!matrix) return <p className="text-xs text-destructive">{m.pairingQrCodeError()}</p>

	const quietZone = 4
	const dimension = matrix.length + quietZone * 2
	let path = ''
	for (let y = 0; y < matrix.length; y++) {
		for (let x = 0; x < matrix.length; x++) {
			if (matrix[y][x]) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`
		}
	}

	return (
		<svg width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges" role="img" aria-label={m.pairingQrCode()}>
			<rect width={dimension} height={dimension} fill="#ffffff" />
			<path d={path} fill="#000000" />
		</svg>
	)
}

/* -------------------------------------------------------------------------- */
/*  Phone handoff settings                                                     */
/* -------------------------------------------------------------------------- */

/** As it comes off the wire — accept either spelling, the Rust side may or may not rename to camelCase. */
interface HandoffStatusPayload {
	enabled: boolean
	endpointId?: string | null
	endpoint_id?: string | null
	pairingUrl?: string | null
	pairing_url?: string | null
}

interface HandoffStatus {
	enabled: boolean
	endpointId: string | null
	pairingUrl: string | null
}

interface HandoffActivity {
	state: 'receiving' | 'loading_model' | 'transcribing' | 'done' | 'error'
	message: string | null
	/** Where the phone's audio was saved. Only present on `done`; either spelling is accepted. */
	savedPath?: string | null
	saved_path?: string | null
}

const OFF: HandoffStatus = { enabled: false, endpointId: null, pairingUrl: null }

function normalizeStatus(payload: HandoffStatusPayload): HandoffStatus {
	return {
		enabled: Boolean(payload.enabled),
		endpointId: payload.endpointId ?? payload.endpoint_id ?? null,
		pairingUrl: payload.pairingUrl ?? payload.pairing_url ?? null,
	}
}

function errorMessage(error: unknown): string {
	if (typeof error === 'string') return error
	if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
	return String(error)
}

/** The backend half of this feature may not be in the build yet — tell them so instead of crashing. */
function isMissingCommand(error: unknown): boolean {
	const text = errorMessage(error).toLowerCase()
	return text.includes('not found') || text.includes('not allowed') || text.includes('unknown') || text.includes('__tauri')
}

/** Whatever the platform calls its file manager. Falls back to neutral wording off-Tauri. */
function revealLabel(): string {
	try {
		if (platform() === 'macos') return m.showInFinder()
		if (platform() === 'windows') return m.showInFileExplorer()
	} catch (error) {
		console.error(error)
	}
	return m.showInFolder()
}

/** Endpoint ids are 64 hex characters; only the ends are useful to a human. */
function shortenEndpointId(id: string): string {
	return id.length <= 20 ? id : `${id.slice(0, 8)}…${id.slice(-8)}`
}

function activityLine(activity: HandoffActivity | null): { text: string; busy: boolean; failed: boolean } {
	if (!activity) return { text: m.phoneWaitingForRecording(), busy: false, failed: false }
	switch (activity.state) {
		case 'receiving':
			return { text: activity.message ?? m.phoneReceivingAudio(), busy: true, failed: false }
		case 'loading_model':
			return { text: activity.message ?? m.phoneLoadingModel(), busy: true, failed: false }
		case 'transcribing':
			return { text: activity.message ?? m.phoneTranscribing(), busy: true, failed: false }
		case 'done':
			return { text: activity.message ?? m.phoneTranscriptSentBack(), busy: false, failed: false }
		default:
			return { text: activity.message ?? m.phoneRecordingFailed(), busy: false, failed: true }
	}
}

export function PhoneSection(_props: { vm: SettingsViewModel }) {
	const [status, setStatus] = useState<HandoffStatus>(OFF)
	const [unavailable, setUnavailable] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [activity, setActivity] = useState<HandoffActivity | null>(null)
	const [copied, setCopied] = useState(false)

	function handleError(caught: unknown) {
		console.error(caught)
		if (isMissingCommand(caught)) setUnavailable(true)
		else setError(errorMessage(caught))
	}

	useEffect(() => {
		invoke<HandoffStatusPayload>('handoff_status')
			.then((payload) => setStatus(normalizeStatus(payload)))
			.catch((caught) => {
				console.error(caught)
				if (isMissingCommand(caught)) setUnavailable(true)
				else setError(errorMessage(caught))
			})
	}, [])

	useEffect(() => {
		let unlisten: UnlistenFn | undefined
		let cancelled = false
		listen<HandoffActivity>('handoff_activity', (event) => setActivity(event.payload))
			.then((fn) => {
				if (cancelled) fn()
				else unlisten = fn
			})
			.catch(console.error)
		return () => {
			cancelled = true
			unlisten?.()
		}
	}, [])

	async function toggle(next: boolean) {
		setBusy(true)
		setError(null)
		try {
			if (next) {
				setStatus(normalizeStatus(await invoke<HandoffStatusPayload>('handoff_start')))
			} else {
				await invoke('handoff_stop')
				setStatus(OFF)
				setActivity(null)
			}
		} catch (caught) {
			handleError(caught)
		} finally {
			setBusy(false)
		}
	}

	async function regenerate() {
		setBusy(true)
		setError(null)
		try {
			setStatus(normalizeStatus(await invoke<HandoffStatusPayload>('handoff_regenerate_token')))
		} catch (caught) {
			handleError(caught)
		} finally {
			setBusy(false)
		}
	}

	async function copyPairingUrl() {
		if (!status.pairingUrl) return
		try {
			await clipboard.writeText(status.pairingUrl)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch (caught) {
			handleError(caught)
		}
	}

	const blurb = m.phoneHandoffInfo()

	if (unavailable) {
		return (
			<div className="space-y-6">
				<SettingsGroup description={blurb}>
					<SettingsNote>{m.phoneHandoffUnavailable()}</SettingsNote>
				</SettingsGroup>
			</div>
		)
	}

	const activityState = activityLine(activity)
	// The phone's recording is kept, not transcribed from a temp file — so it is worth pointing at.
	const savedPath = activity?.state === 'done' ? (activity.savedPath ?? activity.saved_path ?? null) : null

	return (
		<div className="space-y-6">
			<SettingsGroup description={blurb}>
				<SettingsRow label={m.phoneHandoff()} description={m.phoneHandoffToggleInfo()}>
					<Switch checked={status.enabled} disabled={busy} onCheckedChange={toggle} />
				</SettingsRow>
				<SettingsNote>{m.phoneHandoffRelayNote()}</SettingsNote>
			</SettingsGroup>

			{error && (
				<SettingsGroup>
					<SettingsNote>
						<span className="text-destructive">{error}</span>
					</SettingsNote>
				</SettingsGroup>
			)}

			{status.enabled && (
				<>
					<SettingsGroup title={m.pairAPhone()}>
						{status.pairingUrl ? (
							<>
								<SettingsField description={m.scanPairingCodeInfo()}>
									<div className="flex justify-center">
										<div className="rounded-xl bg-white p-3 shadow-xs">
											<QrCode value={status.pairingUrl} size={200} />
										</div>
									</div>
								</SettingsField>

								<SettingsField label={m.pairingLink()}>
									<div className="flex items-center gap-2">
										<code className="min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs break-all text-foreground select-text">
											{status.pairingUrl}
										</code>
										<IconAction
											label={copied ? m.copied() : m.copyPairingLink()}
											icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
											onClick={copyPairingUrl}
										/>
									</div>
								</SettingsField>
							</>
						) : (
							<SettingsNote>{m.noPairingCode()}</SettingsNote>
						)}

						{status.endpointId && (
							<SettingsRow label={m.thisComputer()} description={m.endpointIdInfo()}>
								<span className="font-mono text-xs text-muted-foreground select-text">{shortenEndpointId(status.endpointId)}</span>
							</SettingsRow>
						)}
					</SettingsGroup>

					<SettingsGroup title={m.status()}>
						<SettingsRow label={m.phone()} description={activityState.text} clampDescription={false}>
							{activityState.busy && <Spinner className="text-muted-foreground" />}
							{activityState.failed && <span className="text-xs text-destructive">{m.failed()}</span>}
						</SettingsRow>

						{savedPath && (
							<ActionRow
								label={revealLabel()}
								description={savedPath}
								icon={<FolderOpen className="h-4 w-4" />}
								onClick={() => void invoke('open_path', { path: savedPath })}
							/>
						)}
					</SettingsGroup>

					<SettingsGroup>
						<ActionRow
							label={m.regeneratePairingCode()}
							description={m.regeneratePairingCodeInfo()}
							icon={<RefreshCw className="h-4 w-4" />}
							disabled={busy}
							destructive
							onClick={regenerate}
						/>
					</SettingsGroup>
				</>
			)}
		</div>
	)
}
