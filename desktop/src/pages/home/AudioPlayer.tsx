import formatDuration from 'format-duration'
import { useEffect, useState } from 'react'
import { ReactComponent as PauseIcon } from '~/icons/pause.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import i18n from '~/lib/i18n'
import { Progress } from '~/components/ui/progress'

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

	function onLoadMetadata() {
		setCurrentDuration(0)
		setProgres(0)
		setTotalDuration(audio?.duration || 0)
	}

	function onChangeDuration(e: React.MouseEvent<HTMLDivElement>) {
		const progressBarWidth = e.currentTarget.clientWidth
		const clickPositionPercentage = ((i18n.dir() === 'rtl' ? progressBarWidth - e.nativeEvent.offsetX : e.nativeEvent.offsetX) / progressBarWidth) * 100
		const newTime = (clickPositionPercentage / 100) * totalDuration

		if (audio) {
			audio.currentTime = newTime
		}

		const position = audio.currentTime ?? 1
		const total = audio.duration ?? 1
		setProgres((position / total) * 100)
		setCurrentDuration(newTime)
	}

	useEffect(() => {
		audio.pause()
		audio.addEventListener('loadedmetadata', onLoadMetadata)

		return () => {
			audio.pause()
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
		const position = audio.currentTime ?? 1
		const total = audio.duration ?? 1
		setProgres((position / total) * 100)
		setCurrentDuration(position)
		setTotalDuration(total)
	}

	function play() {
		audio.play()
		setPlaying(true)
		audio.addEventListener('timeupdate', onTimeUpdate)
		audio.addEventListener('ended', onEnd)
	}

	function pause() {
		setPlaying(false)
		audio.pause()
	}

	return (
		<div className="flex flex-col w-full">
			<div className="shadow-lg flex justify-between px-3 py-2 bg-accent relative rounded-lg w-[100%] m-auto mt-3 select-none">
				<span className="overflow-hidden cursor-pointer underline hover:text-primary/80 text-ellipsis" onClick={onLabelClick}>
					{label}
				</span>

				<div className="flex flex-col mt-3 w-[90%] m-auto" onMouseDown={onChangeDuration}>
					<Progress value={progress} className="w-full h-[8px]" />
					<div className="w-full flex flex-row justify-between text-sm mt-1 cursor-default">
						<div>{formatDuration(currentDuration * 1000)}</div>
						<div>{formatDuration(totalDuration === 0 ? 0 : totalDuration * 1000)}</div>
					</div>
				</div>
				<button
					className="absolute bottom-1 left-1/2 -translate-x-1/2 cursor-pointer text-foreground hover:text-primary transition-colors"
					onMouseDown={() => (playing ? pause() : play())}>
					{playing ? <PauseIcon /> : <PlayIcon />}
				</button>
			</div>
		</div>
	)
}
