import formatDuration from 'format-duration'
import { useEffect, useRef, useState } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import i18n from '~/lib/i18n'
import { Button } from '~/components/ui/button'

interface AudioInputProps {
	audio: HTMLAudioElement
	label: string
	onLabelClick: () => void
}

export default function AudioPlayer({ audio, label, onLabelClick }: AudioInputProps) {
	const [playing, setPlaying] = useState(false)
	const [progress, setProgres] = useState(0)
	const [currentDuration, setCurrentDuration] = useState<number>(0)
	const [totalDuration, setTotalDuration] = useState<number>(0)
	const rafRef = useRef<number | null>(null)

	function updateProgressState(position: number, total: number) {
		const safeTotal = total || 1
		setProgres((position / safeTotal) * 100)
		setCurrentDuration(position)
		setTotalDuration(total)
	}

	function onLoadMetadata() {
		setCurrentDuration(0)
		setProgres(0)
		setTotalDuration(audio?.duration || 0)
	}

	function seekFromClientX(clientX: number, element: HTMLDivElement) {
		const rect = element.getBoundingClientRect()
		const progressBarWidth = rect.width
		if (!progressBarWidth) return

		const pointerOffset = clientX - rect.left
		const clampedOffset = Math.min(progressBarWidth, Math.max(0, pointerOffset))
		const ratio = i18n.dir() === 'rtl' ? (progressBarWidth - clampedOffset) / progressBarWidth : clampedOffset / progressBarWidth
		const duration = audio.duration || totalDuration || 0
		const newTime = ratio * duration

		if (audio) audio.currentTime = newTime
		setProgres(ratio * 100)
		setCurrentDuration(newTime)
		setTotalDuration(duration)
	}

	function onSeekPointerDown(e: React.PointerEvent<HTMLDivElement>) {
		e.currentTarget.setPointerCapture(e.pointerId)
		seekFromClientX(e.clientX, e.currentTarget)
	}

	function onSeekPointerMove(e: React.PointerEvent<HTMLDivElement>) {
		if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
		seekFromClientX(e.clientX, e.currentTarget)
	}

	function onSeekPointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId)
		}
	}

	useEffect(() => {
		audio.pause()
		audio.addEventListener('loadedmetadata', onLoadMetadata)
		audio.addEventListener('timeupdate', onTimeUpdate)
		audio.addEventListener('ended', onEnd)

		return () => {
			audio.pause()
			audio.removeEventListener('loadedmetadata', onLoadMetadata)
			audio.removeEventListener('timeupdate', onTimeUpdate)
			audio.removeEventListener('ended', onEnd)
			setPlaying(false)
		}
	}, [audio])

	function onEnd() {
		setCurrentDuration(0)
		setProgres(0)
		setPlaying(false)
		audio.pause()
	}

	function onTimeUpdate(_event: Event) {
		updateProgressState(audio.currentTime ?? 0, audio.duration ?? 0)
	}

	useEffect(() => {
		if (!playing) {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current)
				rafRef.current = null
			}
			return
		}

		const tick = () => {
			updateProgressState(audio.currentTime ?? 0, audio.duration ?? 0)
			rafRef.current = requestAnimationFrame(tick)
		}

		rafRef.current = requestAnimationFrame(tick)
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current)
				rafRef.current = null
			}
		}
	}, [playing, audio])

	function play() {
		audio.play()
		setPlaying(true)
	}

	function pause() {
		setPlaying(false)
		audio.pause()
	}

	function seekBy(seconds: number) {
		const duration = audio.duration || totalDuration || 0
		const next = Math.min(duration, Math.max(0, audio.currentTime + seconds))
		audio.currentTime = next
		updateProgressState(next, duration)
	}

	return (
		<div className="mt-3 w-full">
			<div className="rounded-xl border border-border/70 bg-card p-4 text-card-foreground shadow-sm">
				<div className="flex items-center gap-2.5">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/12">
						<Music2 className="h-4 w-4 text-primary" />
					</div>
					<div className="min-w-0">
						<p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">Now Playing</p>
						<div className="cursor-pointer truncate text-sm font-semibold transition-colors hover:text-primary" onClick={onLabelClick} title={label}>
							{label}
						</div>
					</div>
				</div>

				<div className="mt-4 space-y-2">
					<div
						className="relative h-2 w-full cursor-grab overflow-hidden rounded-full bg-muted touch-none active:cursor-grabbing"
						onPointerDown={onSeekPointerDown}
						onPointerMove={onSeekPointerMove}
						onPointerUp={onSeekPointerUp}
					>
						<div
							className="absolute top-0 left-0 h-full bg-primary"
							style={{ width: `${progress}%` }}
						/>
						<div
							className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-sm"
							style={{ left: `calc(${progress}% - 6px)` }}
						/>
					</div>
					<div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
						<span>{formatDuration(currentDuration * 1000)}</span>
						<span>{formatDuration(Math.max(0, (totalDuration - currentDuration) * 1000))}</span>
					</div>
				</div>

				<div className="mt-3 flex items-center justify-center gap-2.5">
					<Button
						size="iconSm"
						variant="ghost"
						className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground"
						onClick={() => seekBy(-10)}
					>
						<SkipBack className="h-4 w-4" strokeWidth={2.2} />
					</Button>
					<Button
						size="icon"
						className="h-10 w-10 rounded-full bg-primary/85 text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
						onClick={() => (playing ? pause() : play())}
					>
						{playing ? <Pause className="h-5 w-5 fill-current" strokeWidth={2.5} /> : <Play className="ml-0.5 h-5 w-5 fill-current" strokeWidth={2.5} />}
					</Button>
					<Button
						size="iconSm"
						variant="ghost"
						className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground"
						onClick={() => seekBy(10)}
					>
						<SkipForward className="h-4 w-4" strokeWidth={2.2} />
					</Button>
				</div>
			</div>
		</div>
	)
}
