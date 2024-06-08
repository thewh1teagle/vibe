import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'
import { ModifyState } from '~/lib/utils'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
	devices: AudioDevice[]
	device: AudioDevice | null
	setDevice: ModifyState<AudioDevice | null>
}

export default function AudioDeviceInput({ type, devices, device, setDevice }: AudioDeviceInputProps) {
	const { t } = useTranslation()

	const filtered = devices.filter((d) => (d.isInput && type === 'input') || (!d.isInput && type === 'output'))

	return (
		<label className="form-control w-full">
			<div className="label">
				<span className="label-text">{t(type === 'input' ? 'common.microphone' : 'common.speakers')}</span>
			</div>
			<select
				value={device?.id}
				onChange={(event) => {
					const device = filtered.find((d) => d.id === event.target.value)
					if (device) {
						setDevice(device)
					} else {
						setDevice(null)
					}
				}}
				className="select select-bordered">
				<option>{t('common.no-record')}</option>
				{filtered.map(({ id, name }) => (
					<option key={id} value={id}>
						{name}
					</option>
				))}
			</select>
		</label>
	)
}
