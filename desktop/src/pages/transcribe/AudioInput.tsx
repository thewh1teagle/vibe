import { convertFileSrc } from '@tauri-apps/api/core'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import { MutableRefObject, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { NamedPath, cx, pathToNamedPath } from '~/lib/utils'
import AudioPlayer from './AudioPlayer'

interface AudioInputProps {
	path?: NamedPath | null
	setPath: React.Dispatch<React.SetStateAction<NamedPath | null>>
	readonly?: boolean
	audioRef: MutableRefObject<HTMLAudioElement | null>
}

export default function AudioInput({ path, setPath, readonly, audioRef }: AudioInputProps) {
	const { t } = useTranslation()

	useEffect(() => {
		if (!path) {
			return
		}
		audioRef.current?.pause()
		const newAudio = new Audio(convertFileSrc(path.path as string))
		audioRef.current = newAudio
	}, [path])

	async function select() {
		audioRef.current?.pause()

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
			audioRef.current = newAudio
		}
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
			{audioRef.current !== null && <AudioPlayer label={path.name} audio={audioRef.current} onLabelClick={openFolder} />}

			{!readonly && (
				<div onMouseDown={select} className={cx('text-xs text-base-content font-medium cursor-pointer mb-3 mt-1')}>
					{t('common.change-file')}
				</div>
			)}
		</div>
	)
}
