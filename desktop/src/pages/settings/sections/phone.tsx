import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { QrCode as QrCodeIcon, ShieldCheck, Smartphone, Unplug } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { SettingsGroup, SettingsNote, SettingsRow } from './shared'
import { Button } from '~/components/ui/button'
import { PhoneIllustration, PhonePairingPanel } from './phone-pairing'

/* -------------------------------------------------------------------------- */
/*  Phone handoff settings                                                     */
/* -------------------------------------------------------------------------- */

interface PairedDevice {
	id: string
	name: string
	pairedAt: string
}

interface PairedEvent {
	pairingId: string
	device: PairedDevice
}

/** As it comes off the wire — accept either spelling, the Rust side may or may not rename to camelCase. */
interface HandoffStatusPayload {
	enabled: boolean
	endpointId?: string | null
	endpoint_id?: string | null
	pairingUrl?: string | null
	pairing_url?: string | null
	pairingId?: string | null
	pairing_id?: string | null
	devices?: PairedDevice[]
}

interface HandoffStatus {
	enabled: boolean
	endpointId: string | null
	pairingUrl: string | null
	pairingId: string | null
	devices: PairedDevice[]
}

interface HandoffActivity {
	state: 'receiving' | 'loading_model' | 'transcribing' | 'done' | 'error'
	message: string | null
	/** Where the phone's audio was saved. Only present on `done`; either spelling is accepted. */
	savedPath?: string | null
	saved_path?: string | null
}

const OFF: HandoffStatus = { enabled: false, endpointId: null, pairingUrl: null, pairingId: null, devices: [] }

function normalizeStatus(payload: HandoffStatusPayload): HandoffStatus {
	return {
		enabled: Boolean(payload.enabled),
		endpointId: payload.endpointId ?? payload.endpoint_id ?? null,
		pairingUrl: payload.pairingUrl ?? payload.pairing_url ?? null,
		pairingId: payload.pairingId ?? payload.pairing_id ?? null,
		devices: payload.devices ?? [],
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

export function PhoneSection({ pairingOpen, onPairingChange }: { pairingOpen: boolean; onPairingChange: (open: boolean) => void }) {
	const [status, setStatus] = useState<HandoffStatus>(OFF)
	const [unavailable, setUnavailable] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [activity, setActivity] = useState<HandoffActivity | null>(null)
	const [copied, setCopied] = useState(false)
	const statusRef = useRef(status)
	const navigationRef = useRef({ pairingOpen, onPairingChange, generation: 0 })
	if (navigationRef.current.pairingOpen !== pairingOpen) navigationRef.current.generation += 1
	navigationRef.current.pairingOpen = pairingOpen
	navigationRef.current.onPairingChange = onPairingChange
	const mounted = useRef(false)
	const pending = useRef<Promise<unknown>>(Promise.resolve())

	const handleError = useCallback((caught: unknown) => {
		if (!mounted.current) return
		console.error(caught)
		if (isMissingCommand(caught)) setUnavailable(true)
		else setError(errorMessage(caught))
	}, [])

	// Serialize reads and mutations so a late status response cannot restore a revoked phone.
	const updateStatus = useCallback((command: string, args?: Record<string, unknown>) => {
		const operation = pending.current.then(async () => {
			if (command === 'handoff_stop') await invoke(command)
			const payload = await invoke<HandoffStatusPayload>(command === 'handoff_stop' ? 'handoff_status' : command, args)
			const next = normalizeStatus(payload)
			if (mounted.current) {
				statusRef.current = next
				setStatus(next)
			}
			return next
		})
		pending.current = operation.catch(() => {})
		return operation
	}, [])

	useEffect(() => {
		mounted.current = true
		void updateStatus('handoff_status').catch(handleError)
		let cancelled = false
		let unlisten: UnlistenFn | undefined
		listen<PairedEvent>('handoff_paired', ({ payload }) => {
			if (cancelled) return
			const navigation = navigationRef.current
			const shouldGoBack = navigation.pairingOpen && payload.pairingId === statusRef.current.pairingId
			const generation = navigation.generation
			void updateStatus('handoff_status')
				.then((next) => {
					if (cancelled || !next.devices.some((device) => device.id === payload.device.id)) return
					if (shouldGoBack && navigationRef.current.pairingOpen && navigationRef.current.generation === generation) {
						navigationRef.current.onPairingChange(false)
						toast.success(m.phonePairingSuccess())
					}
				})
				.catch(handleError)
		})
			.then((dispose) => {
				if (cancelled) dispose()
				else unlisten = dispose
			})
			.catch(console.error)
		return () => {
			cancelled = true
			mounted.current = false
			unlisten?.()
		}
	}, [handleError, updateStatus])

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
				await updateStatus('handoff_start')
				onPairingChange(true)
			} else {
				await updateStatus('handoff_stop')
				onPairingChange(false)
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
			await updateStatus('handoff_regenerate_token')
			setCopied(false)
			return true
		} catch (caught) {
			handleError(caught)
			return false
		} finally {
			setBusy(false)
		}
	}

	async function revoke(deviceId?: string) {
		setBusy(true)
		setError(null)
		try {
			await updateStatus(deviceId ? 'handoff_revoke_device' : 'handoff_revoke_all', deviceId ? { deviceId } : undefined)
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

	if (pairingOpen && status.enabled) {
		return <PhonePairingPanel pairingUrl={status.pairingUrl} busy={busy} copied={copied} error={error} onCopy={copyPairingUrl} onRegenerate={regenerate} />
	}

	return (
		<div className="space-y-5">
			<div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
				<PhoneIllustration />
				<div className="px-5 pb-5 text-center">
					<h3 className="text-lg font-semibold tracking-tight">{m.phoneHeroTitle()}</h3>
					<p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{blurb}</p>
				</div>
			</div>

			<div className="space-y-2">
				<div className="px-1">
					<h3 className="text-[13px] font-medium">{m.phoneConnection()}</h3>
				</div>
				<SettingsGroup>
					<SettingsRow label={m.allowPhoneRecordings()} description={m.phoneHandoffToggleInfo()} clampDescription={false}>
						<Switch aria-label={m.allowPhoneRecordings()} checked={status.enabled} disabled={busy} onCheckedChange={toggle} />
					</SettingsRow>
					{status.enabled && (
						<SettingsRow label={m.pairAPhone()} description={m.phonePairDescription()} clampDescription={false}>
							<Button size="sm" variant="outline" className="font-medium" onClick={() => onPairingChange(true)} disabled={busy}>
								<QrCodeIcon aria-hidden="true" />
								{m.phoneShowCode()}
							</Button>
						</SettingsRow>
					)}
				</SettingsGroup>
			</div>

			<SettingsGroup
				title={
					<span className="flex min-h-7 items-center justify-between gap-3">
						<span>{m.phonePairedDevices()}</span>
						{status.devices.length > 1 && (
							<Button
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-xs font-normal text-muted-foreground"
								title={m.revokeAllPhonesInfo()}
								disabled={busy}
								onClick={() => revoke()}>
								<Unplug aria-hidden="true" />
								{m.revokeAllPhones()}
							</Button>
						)}
					</span>
				}>
				{status.devices.length === 0 ? (
					<SettingsNote>{m.phoneNoPairedDevices()}</SettingsNote>
				) : (
					status.devices.map((device) => (
						<div key={device.id} className="flex items-center gap-3 px-4 py-3">
							<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
								<Smartphone aria-hidden="true" className="h-4 w-4" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm">{device.name}</p>
								<p className="text-xs text-muted-foreground">
									{m.phonePairedOn({ date: new Date(device.pairedAt).toLocaleDateString(getLocale(), { dateStyle: 'medium' }) })}
								</p>
							</div>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 shrink-0 px-2 text-xs font-normal text-muted-foreground"
								aria-label={m.phoneRevokeDeviceNamed({ name: device.name })}
								disabled={busy}
								onClick={() => revoke(device.id)}>
								{m.phoneRevokeDevice()}
							</Button>
						</div>
					))
				)}
			</SettingsGroup>

			{error && (
				<p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
					{error}
				</p>
			)}

			{status.enabled && (
				<SettingsGroup title={m.phoneActivity()}>
					<div role="status" className="flex items-center gap-3 px-4 py-3">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
							{activityState.busy ? <Spinner /> : <Smartphone aria-hidden="true" className="h-4 w-4" />}
						</span>
						<p className={`text-xs leading-relaxed ${activityState.failed ? 'text-destructive' : 'text-muted-foreground'}`}>{activityState.text}</p>
					</div>
				</SettingsGroup>
			)}

			<p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
				<ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
				{m.phoneHandoffRelayNote()}
			</p>
		</div>
	)
}
