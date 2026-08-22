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

/**
 * Fired on `window` with `{ seconds }` to move this player, so anything on screen (a transcript
 * timestamp, for one) can seek without a handle on the audio element.
 */
export const PLAYER_SEEK_EVENT = 'vibe:player-seek'

/**
 * Fired on `window` with `{ seconds, playing }` while the media plays (and on every seek, play and
 * pause) so the transcript can follow along without owning the audio element.
 */
export const PLAYER_TIME_EVENT = 'vibe:player-time'

/** Fired on `window` to play/pause from elsewhere — the transcript's spacebar shortcut. */
export const PLAYER_TOGGLE_EVENT = 'vibe:player-toggle'

export interface PlayerTimeDetail {
	seconds: number
	playing: boolean
}

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

	// The transcript highlights the line being spoken; it reads the position from these events.
	const broadcast = useCallback((seconds: number, isPlaying: boolean) => {
		window.dispatchEvent(new CustomEvent<PlayerTimeDetail>(PLAYER_TIME_EVENT, { detail: { seconds, playing: isPlaying } }))
	}, [])

	// One audio element per source: switching files stops playback and swaps the stream.
	useEffect(() => {
		const audio = new Audio(convertFileSrc(sourcePath))
		audio.preload = 'metadata'
		audioRef.current = audio
		setPlaying(false)
		setCurrentTime(0)
		setDuration(Number.NaN)
		broadcast(0, false)

		const onTime = () => {
			setCurrentTime(audio.currentTime)
			broadcast(audio.currentTime, !audio.paused)
		}
		const onMetadata = () => setDuration(audio.duration)
		const onPlay = () => {
			setPlaying(true)
			broadcast(audio.currentTime, true)
		}
		const onPause = () => {
			setPlaying(false)
			broadcast(audio.currentTime, false)
		}
		const onEnded = () => {
			setPlaying(false)
			setCurrentTime(0)
			broadcast(0, false)
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
	}, [broadcast, sourcePath])

	// `timeupdate` only fires ~4x/second which makes the fill step visibly; while playing, the
	// position is sampled every animation frame instead so the bar glides.
	useEffect(() => {
		if (!playing) return
		let frame = 0
		const tick = () => {
			const audio = audioRef.current
			if (audio) {
				setCurrentTime(audio.currentTime)
				broadcast(audio.currentTime, true)
			}
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
			broadcast(next, !audio.paused)
		},
		[broadcast, duration, seekable],
	)

	// Seek requests from elsewhere in the window (transcript timestamps). Read straight off the
	// element so the handler never goes stale, and no-op while there is nothing to seek yet.
	useEffect(() => {
		const onSeekRequest = (event: Event) => {
			const seconds = (event as CustomEvent<{ seconds?: number }>).detail?.seconds
			const audio = audioRef.current
			if (!audio || typeof seconds !== 'number' || !Number.isFinite(seconds)) return
			const limit = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY
			const next = Math.min(Math.max(seconds, 0), limit)
			try {
				audio.currentTime = next
			} catch {
				// The media has no seekable range yet; nothing to do.
				return
			}
			setCurrentTime(next)
			broadcast(next, true)
			if (audio.paused) void audio.play().catch(() => setPlaying(false))
		}
		window.addEventListener(PLAYER_SEEK_EVENT, onSeekRequest)
		window.addEventListener(PLAYER_TOGGLE_EVENT, toggle)
		return () => {
			window.removeEventListener(PLAYER_SEEK_EVENT, onSeekRequest)
			window.removeEventListener(PLAYER_TOGGLE_EVENT, toggle)
		}
	}, [broadcast, toggle])

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
			toast.error(m.couldNotOpenFolder(), { position: 'bottom-center' })
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
			toast.error(m.audioCopyUnavailable(), { position: 'bottom-center' })
		}
	}

	const progress = seekable ? Math.min(Math.max(currentTime / duration, 0), 1) : 0

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: 'easeOut' }}
			className="sticky bottom-0 z-10 flex h-16 shrink-0 items-center gap-4 border-t border-border bg-background/85 px-4 backdrop-blur-md">
			<div className="hidden min-w-0 basis-[150px] flex-col justify-center sm:flex">
				<div className="truncate text-[13px] font-medium text-foreground">{job.name}</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void revealInFolder()}
							className="cursor-pointer truncate text-start text-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80">
							{sourcePath}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">{m.showInFolder()}</TooltipContent>
				</Tooltip>
			</div>

			{/* Transport controls read left-to-right in every locale, like the timeline they drive. */}
			<div dir="ltr" className="flex min-w-0 flex-1 items-center gap-3">
				<Button
					size="icon"
					onClick={toggle}
					aria-label={playing ? m.pause() : m.play()}
					className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
					{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
				</Button>

				<span className="w-10 shrink-0 text-end font-mono text-[11px] tabular-nums text-muted-foreground">{formatTime(currentTime)}</span>

				<div
					ref={trackRef}
					role="slider"
					tabIndex={seekable ? 0 : -1}
					aria-label={m.seek()}
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
						<div className="h-full rounded-full bg-foreground" style={{ width: `${progress * 100}%` }} />
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
