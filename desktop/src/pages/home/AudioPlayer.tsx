import formatDuration from 'format-duration'
import { useEffect, useState } from 'react'
import { ReactComponent as PauseIcon } from '~/icons/pause.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import i18n from '~/lib/i18n'
import { cx } from '~/lib/utils'

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

	function onChangeDuration(e: React.MouseEvent<HTMLProgressElement>) {
		// Get the total width of the progress bar
		const progressBarWidth = e.currentTarget.clientWidth

		// Calculate the clicked position as a percentage
		const clickPositionPercentage = ((i18n.dir() === 'rtl' ? progressBarWidth - e.nativeEvent.offsetX : e.nativeEvent.offsetX) / progressBarWidth) * 100

		// Calculate the new time based on the total duration and clicked position
		const newTime = (clickPositionPercentage / 100) * totalDuration

		// Update the current time of the audio
		if (audio) {
			audio.currentTime = newTime
		}

		// Update progress
		const position = audio.currentTime ?? 1
		const total = audio.duration ?? 1
		const newProgress = (position / total) * 100
		setProgres(newProgress)

		// Update your state if needed
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
		const newProgress = (position / total) * 100
		setProgres(newProgress)

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
			<div className="flex-col shadow-lg flex justify-between px-3 py-2 bg-base-300 relative rounded-lg  w-[100%] m-auto mt-3 select-none">
				<span className="overflow-hidden cursor-pointer link link-hover text-ellipsis" onClick={onLabelClick}>
					{label}
				</span>

				<div className="flex flex-col mt-3 w-[90%] m-auto ">
					<progress
						onMouseDown={onChangeDuration}
						className="progress w-full h-[5px] bg-base-100 hover:h-[12px] transition-height duration-100 ease-in-out progress-primary rounded-3xl"
						value={progress}
						max="100"></progress>
					<div className="w-full flex flex-row justify-between text-sm mt-1 cursor-default">
						<div>{formatDuration(currentDuration * 1000)}</div>
						<div>{formatDuration(totalDuration === 0 ? 0 : totalDuration * 1000)}</div>
					</div>
				</div>
				<label className={cx('swap text-1xl absolute bottom-1 left-1/2 -translate-x-1/2', playing && 'swap-active')}>
					<div className="swap-off">
						<PlayIcon onMouseDown={() => (playing ? pause() : play())} />
					</div>
					<div className="swap-on">
						<PauseIcon onMouseDown={() => (playing ? pause() : play())} />
					</div>
				</label>
			</div>
		</div>
	)
}
