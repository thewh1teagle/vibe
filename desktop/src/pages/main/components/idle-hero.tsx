import { AnimatePresence, motion } from 'framer-motion'
import { Link2, Mic, Square, Upload } from 'lucide-react'
import { useEffect } from 'react'
import { m } from '~/paraglide/messages.js'
import AudioDeviceInput from '~/components/audio-device-input'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/style'
import { useSession, type IdlePanel } from '../session'
import QuietRow from './quiet-row'

function formatElapsed(seconds: number) {
	const minutes = Math.floor(seconds / 60)
	return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium transition-colors duration-150',
				active
					? 'border-transparent bg-primary/10 text-foreground'
					: 'text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
			)}>
			{children}
		</button>
	)
}

function RecordPanel() {
	const { recording, recordElapsed, preference } = useSession()

	useEffect(() => {
		// The recording hook loads audio devices for this tab only.
		preference.setHomeTab('record')
	}, [])

	if (recording.isRecording) {
		return (
			<div className="flex flex-col items-center gap-5">
				<div className="flex items-center gap-3">
					<span className="relative flex h-3 w-3">
						<span className="aurora absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-70" />
						<span className="aurora relative inline-flex h-3 w-3 rounded-full bg-primary/80" />
					</span>
					<span className="font-mono text-2xl tracking-tight tabular-nums">{formatElapsed(recordElapsed)}</span>
				</div>
				<Button onClick={() => recording.stopRecord()} className="h-11 rounded-full px-6">
					<Square className="h-3.5 w-3.5 fill-current" />
					{m.stopAndTranscribe()}
				</Button>
			</div>
		)
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<AudioDeviceInput type="input" devices={recording.devices} device={recording.inputDevice} setDevice={recording.setInputDevice} />
				<AudioDeviceInput type="output" devices={recording.devices} device={recording.outputDevice} setDevice={recording.setOutputDevice} />
			</div>
			<Button
				onClick={() => recording.startRecord()}
				disabled={!preference.modelPath || (!recording.inputDevice && !recording.outputDevice)}
				className="h-11 self-center rounded-full px-6">
				<Mic className="h-4 w-4" />
				{m.startRecord()}
			</Button>
		</div>
	)
}

function LinkPanel() {
	const { link, preference } = useSession()

	if (link.downloadingAudio) {
		return (
			<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
				<Spinner />
				<span>{m.downloading({ progress: String(link.ytdlpProgress ?? 0) })}</span>
				<button type="button" className="cursor-pointer text-destructive hover:underline" onClick={() => link.cancelYtDlpDownload()}>
					{m.cancel()}
				</button>
			</div>
		)
	}

	return (
		<div className="flex w-full items-center gap-2">
			<Input
				type="text"
				value={link.audioUrl}
				onChange={(event) => link.setAudioUrl(event.target.value)}
				onKeyDown={(event) => (event.key === 'Enter' ? link.downloadAudio() : null)}
				placeholder="https://www.youtube.com/watch?v=..."
				className="h-11 rounded-full px-4"
			/>
			<Button onClick={() => link.downloadAudio()} disabled={!preference.modelPath || !link.audioUrl} className="h-11 shrink-0 rounded-full px-5">
				{m.downloadFile()}
			</Button>
		</div>
	)
}

export default function IdleHero() {
	const { dragging, browse, collectingFolder, panel, setPanel, link, recording } = useSession()

	function togglePanel(next: IdlePanel) {
		if (recording.isRecording) return
		setPanel(panel === next ? 'none' : next)
		if (next === 'link' && panel !== 'link') void link.switchToLinkTab()
	}

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-10">
			{/* Source switcher: the active source replaces the drop area entirely. */}
			<div className="flex flex-wrap items-center justify-center gap-2">
				<Pill active={panel === 'none'} onClick={() => togglePanel('none')}>
					<Upload className="h-3.5 w-3.5" />
					File
				</Pill>
				<Pill active={panel === 'record'} onClick={() => togglePanel('record')}>
					<Mic className="h-3.5 w-3.5" />
					{m.record()}
				</Pill>
				<Pill active={panel === 'link'} onClick={() => togglePanel('link')}>
					<Link2 className="h-3.5 w-3.5" />
					From link
				</Pill>
			</div>

			<AnimatePresence mode="wait" initial={false}>
				{panel === 'none' ? (
					<motion.button
						key="drop"
						type="button"
						onClick={() => void browse()}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						className={cn(
							'group relative cursor-pointer overflow-hidden rounded-[1.25rem] border-2 border-dashed bg-card transition-colors duration-150',
							dragging ? 'border-ring' : 'border-border hover:border-ring/50',
						)}>
						<div
							className={cn(
								'aurora pointer-events-none absolute inset-0 transition-opacity duration-200',
								dragging ? 'opacity-100' : 'opacity-50 group-hover:opacity-80',
							)}
						/>

						<div className="relative flex flex-col items-center gap-4 px-8 py-14 text-center">
							<span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/70 text-foreground shadow-sm">
								{collectingFolder ? <Spinner className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
							</span>
							<div className="space-y-1">
								<h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">Drop audio, video or a folder here</h1>
								<p className="text-[13px] text-muted-foreground">or click to browse your files</p>
							</div>
						</div>
					</motion.button>
				) : (
					<motion.div
						key={panel}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						className="rounded-[1.25rem] border border-border bg-card px-8 py-10">
						{panel === 'record' ? <RecordPanel /> : <LinkPanel />}
					</motion.div>
				)}
			</AnimatePresence>

			<QuietRow />
		</div>
	)
}
