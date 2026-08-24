import { useState } from 'react'
import { AlertTriangle, Check, Copy, HardDriveDownload, Mic, QrCode, RefreshCw, RotateCcw, Settings, Square, Trash2 } from 'lucide-react'

import { InstallHint } from '~/components/install-hint'
import { OutboxCard } from '~/components/outbox-card'
import { SettingsSheet } from '~/components/settings-sheet'
import { VibeMark } from '~/components/vibe-mark'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { basename, truncateId } from '~/lib/handoff'
import { languageLabel } from '~/lib/languages'
import { formatDuration, formatSize } from '~/lib/recorder'
import { cn } from '~/lib/style'
import { useHandoffSession } from '~/lib/use-handoff-session'

export function App() {
	// Everything below is markup: the state machine lives in the hook.
	const {
		secure,
		recordable,
		peer,
		capabilities,
		capabilitiesError,
		capabilitiesLoading,
		refreshCapabilities,
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
		hasRecording,
		startRecording,
		stopRecording,
		outbox,
		persisted,
		pumpOutbox,
		discardQueued,
		lang,
		onLangChange,
		copied,
		onCopy,
		onDiscard,
		onUnpair,
	} = useHandoffSession()

	const [settingsOpen, setSettingsOpen] = useState(false)

	const unpair = () => {
		setSettingsOpen(false)
		onUnpair()
	}

	if (!secure) return <Shell>{<InsecureNotice />}</Shell>
	if (!peer) return <Shell>{<UnpairedNotice />}</Shell>

	const recording = phase === 'recording'
	const busy = phase === 'sending'

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
								<Button variant="destructive" className="h-12 w-full" onClick={unpair}>
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
				onDelete={discardQueued}
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
				onUnpair={unpair}
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
				<div className="flex min-w-0 items-center gap-2">
					<VibeMark className="size-6" />
					<h1 className="text-base font-semibold">
						Vibe <span className="font-normal text-muted-foreground">Phone</span>
					</h1>
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
