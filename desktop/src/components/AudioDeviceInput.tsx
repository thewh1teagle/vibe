import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
	devices: AudioDevice[]
	device: AudioDevice | null
	setDevice: Dispatch<SetStateAction<AudioDevice | null>>
}

export default function AudioDeviceInput({ type, devices, device, setDevice }: AudioDeviceInputProps) {
	const { t } = useTranslation()

	const filteredDevices = devices.filter((d) => (d.isInput && type === 'input') || (!d.isInput && type === 'output'))
	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t(type === 'input' ? 'common.microphone' : 'common.speakers')}</span>
			</div>
			<select onChange={(event) => setDevice(devices.find((d) => d.id === event?.target.value)!)} value={device?.id} className="select select-bordered">
				<option>{t('common.select-audio-device')}</option>
				{filteredDevices.map(({ id, name }) => (
					<option key={id} value={id}>
						{name}
					</option>
				))}
			</select>
		</label>
	)
}
