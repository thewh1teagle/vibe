import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'
import { ModifyState } from '~/lib/utils'
import { Label } from '~/components/ui/label'
import { NativeSelect } from '~/components/ui/native-select'

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
		<div className="space-y-2 w-full">
			<Label>{t(type === 'input' ? 'common.microphone' : 'common.speakers')}</Label>
			<NativeSelect
				value={device?.id}
				onChange={(event) => {
					const next = filtered.find((d) => d.id === event.target.value)
					setDevice(next ?? null)
				}}>
				<option>{t('common.no-record')}</option>
				{filtered.map(({ id, name }) => (
					<option key={id} value={id}>
						{name}
					</option>
				))}
			</NativeSelect>
		</div>
	)
}
