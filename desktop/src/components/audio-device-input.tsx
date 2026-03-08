import { useTranslation } from 'react-i18next'
import { AudioDevice } from '~/lib/audio'
import { ModifyState } from '~/lib/utils'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

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
			<Select value={device?.id ?? 'none'} onValueChange={(value) => {
				if (value === 'none') {
					setDevice(null)
					return
				}
				const next = filtered.find((d) => d.id === value)
				setDevice(next ?? null)
			}}>
				<SelectTrigger>
					<SelectValue placeholder={t('common.no-record')} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{t('common.no-record')}</SelectItem>
					{filtered.map(({ id, name }) => (
						<SelectItem key={id} value={id}>
							{name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
