import { convertFileSrc } from '@tauri-apps/api/core'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import formatDuration from 'format-duration'
import { MutableRefObject, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as PauseIcon } from '~/icons/pause.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import * as config from '~/lib/config'
import i18n from '~/lib/i18n'
import { NamedPath, cx, pathToNamedPath } from '~/lib/utils'

interface AudioInputProps {
	path?: NamedPath | null
	setPath: React.Dispatch<React.SetStateAction<NamedPath | null>>
	readonly?: boolean
	audioRef: MutableRefObject<HTMLAudioElement | null>
}

export default function AudioInput({ path, setPath, readonly, audioRef }: AudioInputProps) {
	const [playing, setPlaying] = useState(false)
	const { t } = useTranslation()
	const [progress, setProgres] = useState(0)
	const [currentDuration, setCurrentDuration] = useState<number>(0)
	const [totalDuration, setTotalDuration] = useState<number>(0)

	function onLoadMetadata() {
		setTotalDuration(audioRef?.current?.duration ?? 0)
	}

	function onChangeDuration(e: React.MouseEvent<HTMLProgressElement>) {
		// Get the total width of the progress bar
		const progressBarWidth = e.currentTarget.clientWidth

		// Calculate the clicked position as a percentage
		const clickPositionPercentage = ((i18n.dir() === 'rtl' ? progressBarWidth - e.nativeEvent.offsetX : e.nativeEvent.offsetX) / progressBarWidth) * 100

		// Calculate the new time based on the total duration and clicked position
		const newTime = (clickPositionPercentage / 100) * totalDuration

		// Update the current time of the audio
		if (audioRef.current) {
			audioRef.current.currentTime = newTime
		}

		// Update your state if needed
		setCurrentDuration(newTime)
	}

	useEffect(() => {
		if (!path) {
			return
		}
		audioRef.current?.pause()
		const newAudio = new Audio(convertFileSrc(path.path as string))
		audioRef.current = newAudio
		newAudio.addEventListener('loadedmetadata', onLoadMetadata)

		return () => {
			audioRef.current?.pause()
			audioRef?.current?.removeEventListener('ended', onEnd)
			setPlaying(false)
		}
	}, [path])

	async function select() {
		audioRef.current?.pause()
		setPlaying(false)

		const selected = await dialog.open({
			multiple: false,
			filters: [
				{
					name: 'Audio',
					extensions: [...config.audioExtensions, ...config.videoExtensions],
				},
			],
		})
		if (selected) {
			const named = await pathToNamedPath(selected.path)
			setPath(named)

			audioRef.current?.pause()

			const newAudio = new Audio(convertFileSrc(selected.path as string))
			newAudio.addEventListener('loadedmetadata', onLoadMetadata)
			audioRef.current = newAudio
		}
	}

	function onEnd() {
		setPlaying(false)
		audioRef.current?.pause()
	}

	function onTimeUpdate(_event: Event) {
		const position = audioRef.current?.currentTime ?? 1
		const total = audioRef.current?.duration ?? 1
		const newProgress = (position / total) * 100
		setProgres(newProgress)

		setCurrentDuration(position)
		setTotalDuration(total)
	}

	function play() {
		audioRef.current?.play()
		setPlaying(true)
		audioRef.current?.addEventListener('timeupdate', onTimeUpdate)
		audioRef.current?.addEventListener('ended', onEnd)
	}

	function pause() {
		setPlaying(false)
		audioRef.current?.pause()
	}

	function openFolder() {
		const folderPath = path?.path.replace(path.name ?? '', '')
		if (folderPath) {
			shell.open(folderPath)
		}
	}

	if (!path) {
		return (
			<div className="flex items-center w-full justify-center">
				<button onMouseDown={select} className="btn btn-primary w-full">
					{t('common.select-audio-file')}
				</button>
			</div>
		)
	}

	return (
		<div className="flex flex-col w-full">
			<div className="flex-col shadow-lg flex justify-between px-3 py-2 bg-base-200 relative rounded-lg  w-[100%] m-auto mt-3 select-none">
				<div>
					<span className="overflow-hidden cursor-pointer" onClick={openFolder}>
						{path.name}
					</span>
				</div>

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

			{!readonly && (
				<div onMouseDown={select} className={cx('text-xs text-base-content font-medium cursor-pointer mb-3 mt-1')}>
					{t('common.change-file')}
				</div>
			)}
		</div>
	)
}
