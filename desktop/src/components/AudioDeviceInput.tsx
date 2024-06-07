import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
	devices: AudioDevice[]
}

export default function AudioDeviceInput({ type, devices }: AudioDeviceInputProps) {
	const { t } = useTranslation()

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
