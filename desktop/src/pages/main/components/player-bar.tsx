import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { motion } from 'framer-motion'
import { Download, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/style'
import type { NamedPath } from '~/lib/types'
import type { Job } from '../hooks/use-transcribe-queue'

/** mm:ss, or --:-- when the media has no usable duration (streams, failed metadata). */
function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
	const total = Math.floor(seconds)
	const minutes = Math.floor(total / 60)
	return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/** Containing folder of a path, for both posix and windows separators. */
function dirname(path: string) {
	const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
	return index > 0 ? path.slice(0, index) : path
}

function extension(path: string) {
	const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1) : ''
}

export default function PlayerBar({ job }: { job: Job }) {
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const trackRef = useRef<HTMLDivElement>(null)
	const [playing, setPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(Number.NaN)

	const sourcePath = job.path
	const seekable = Number.isFinite(duration) && duration > 0

	// One audio element per source: switching files stops playback and swaps the stream.
	useEffect(() => {
		const audio = new Audio(convertFileSrc(sourcePath))
		audio.preload = 'metadata'
		audioRef.current = audio
		setPlaying(false)
		setCurrentTime(0)
		setDuration(Number.NaN)

		const onTime = () => setCurrentTime(audio.currentTime)
		const onMetadata = () => setDuration(audio.duration)
		const onPlay = () => setPlaying(true)
		const onPause = () => setPlaying(false)
		const onEnded = () => {
			setPlaying(false)
			setCurrentTime(0)
		}

		audio.addEventListener('timeupdate', onTime)
		audio.addEventListener('loadedmetadata', onMetadata)
		audio.addEventListener('durationchange', onMetadata)
		audio.addEventListener('play', onPlay)
		audio.addEventListener('pause', onPause)
		audio.addEventListener('ended', onEnded)

		return () => {
			audio.removeEventListener('timeupdate', onTime)
			audio.removeEventListener('loadedmetadata', onMetadata)
			audio.removeEventListener('durationchange', onMetadata)
			audio.removeEventListener('play', onPlay)
			audio.removeEventListener('pause', onPause)
			audio.removeEventListener('ended', onEnded)
			audio.pause()
			audio.src = ''
			if (audioRef.current === audio) audioRef.current = null
		}
	}, [sourcePath])

	// `timeupdate` only fires ~4x/second which makes the fill step visibly; while playing, the
	// position is sampled every animation frame instead so the bar glides.
	useEffect(() => {
		if (!playing) return
		let frame = 0
		const tick = () => {
			const audio = audioRef.current
			if (audio) setCurrentTime(audio.currentTime)
			frame = requestAnimationFrame(tick)
		}
		frame = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame)
	}, [playing])

	const toggle = useCallback(() => {
		const audio = audioRef.current
		if (!audio) return
		if (audio.paused) void audio.play().catch(() => setPlaying(false))
		else audio.pause()
	}, [])

	const seekTo = useCallback(
		(seconds: number) => {
			const audio = audioRef.current
			if (!audio || !seekable) return
			const next = Math.min(Math.max(seconds, 0), duration)
			audio.currentTime = next
			setCurrentTime(next)
		},
		[duration, seekable],
	)

	const seekToClientX = useCallback(
		(clientX: number) => {
			const track = trackRef.current
			if (!track) return
			const rect = track.getBoundingClientRect()
			if (rect.width === 0) return
			const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
			seekTo(ratio * duration)
		},
		[duration, seekTo],
	)

	async function revealInFolder() {
		try {
			await invoke('open_path', { path: dirname(sourcePath) })
		} catch {
			toast.error('Could not open the containing folder', { position: 'bottom-center' })
		}
	}

	async function saveACopy() {
		const ext = extension(sourcePath)
		try {
			let defaultPath = sourcePath
			try {
				const suggested = await invoke<NamedPath>('get_save_path', { srcPath: sourcePath, targetExt: ext })
				defaultPath = suggested.path
			} catch {
				// Falling back to the source path as the dialog suggestion is fine.
			}
			const target = await dialog.save({
				filters: ext ? [{ name: '', extensions: [ext] }] : undefined,
				canCreateDirectories: true,
				defaultPath,
			})
			if (!target) return
			await fs.copyFile(sourcePath, target)
			toast.success(m.saveSuccess(), {
				description: job.name,
				position: 'bottom-center',
				action: { label: m.findHere(), onClick: () => void invoke('open_path', { path: dirname(target) }) },
			})
		} catch {
			toast.error('Saving a copy of the audio is not available here', { position: 'bottom-center' })
		}
	}

	const progress = seekable ? Math.min(Math.max(currentTime / duration, 0), 1) : 0

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: 'easeOut' }}
			className="sticky bottom-0 z-10 flex h-16 shrink-0 items-center gap-4 border-t border-border bg-background/85 px-4 backdrop-blur-md">
			<div className="hidden min-w-0 basis-[200px] flex-col justify-center sm:flex">
				<div className="truncate text-[13px] font-medium text-foreground">{job.name}</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void revealInFolder()}
							className="truncate text-start text-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80">
							{sourcePath}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Show in folder</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Button
					size="icon"
					onClick={toggle}
					aria-label={playing ? 'Pause' : 'Play'}
					className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
					{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
				</Button>

				<span className="w-10 shrink-0 text-end font-mono text-[11px] tabular-nums text-muted-foreground">{formatTime(currentTime)}</span>

				<div
					ref={trackRef}
					role="slider"
					tabIndex={seekable ? 0 : -1}
					aria-label="Seek"
					aria-valuemin={0}
					aria-valuemax={seekable ? Math.floor(duration) : 0}
					aria-valuenow={Math.floor(currentTime)}
					aria-disabled={!seekable}
					onPointerDown={(event) => {
						if (!seekable) return
						event.currentTarget.setPointerCapture(event.pointerId)
						seekToClientX(event.clientX)
					}}
					onPointerMove={(event) => {
						if (!seekable || !event.currentTarget.hasPointerCapture(event.pointerId)) return
						seekToClientX(event.clientX)
					}}
					onPointerUp={(event) => {
						if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
					}}
					onKeyDown={(event) => {
						if (!seekable) return
						if (event.key === 'ArrowRight') {
							event.preventDefault()
							seekTo(currentTime + 5)
						} else if (event.key === 'ArrowLeft') {
							event.preventDefault()
							seekTo(currentTime - 5)
						} else if (event.key === ' ') {
							event.preventDefault()
							toggle()
						}
					}}
					className={cn(
						'group relative flex h-6 min-w-0 flex-1 touch-none items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
						seekable ? 'cursor-pointer' : 'cursor-default opacity-60',
					)}>
					<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
						<div className="aurora-bar h-full rounded-full" style={{ width: `${progress * 100}%` }} />
					</div>
					<div
						aria-hidden
						className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
						style={{ left: `${progress * 100}%` }}
					/>
				</div>

				<span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{formatTime(duration)}</span>
			</div>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="iconSm" onClick={() => void saveACopy()} aria-label={m.save()} className="shrink-0 rounded-full">
						<Download className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">{m.save()}</TooltipContent>
			</Tooltip>
		</motion.div>
	)
}
