import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
}

export default function AudioDeviceInput({ type }: AudioDeviceInputProps) {
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const { t } = useTranslation()

	async function loadDevices() {
		let newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		newDevices = newDevices.filter((d) => (type === 'input' ? d.isInput : !d.isInput))
		setDevices(newDevices)
	}

	useEffect(() => {
		loadDevices()
	}, [])

	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t(type === 'input' ? 'common.microphone' : 'common.speakers')}</span>
			</div>
			<select className="select select-bordered">
				{devices.map(({ id, name }) => (
					<option key={id} value={id}>
						{name}
					</option>
				))}
			</select>
		</label>
	)
}
