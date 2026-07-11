import { m } from '~/paraglide/messages.js'
import { AudioDevice } from '~/lib/audio'
import { ModifyState } from '~/lib/types'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
	devices: AudioDevice[]
	device: AudioDevice | null
	setDevice: ModifyState<AudioDevice | null>
}

export default function AudioDeviceInput({ type, devices, device, setDevice }: AudioDeviceInputProps) {

	const filtered = devices.filter((d) => (d.isInput && type === 'input') || (!d.isInput && type === 'output'))

	return (
		<div className="space-y-2.5 w-full">
			<Label>{type === 'input' ? m.microphone() : m.speakers()}</Label>
			<Select value={device?.id ?? 'none'} onValueChange={(value) => {
				if (value === 'none') {
					setDevice(null)
					return
				}
				const next = filtered.find((d) => d.id === value)
				setDevice(next ?? null)
			}}>
				<SelectTrigger>
					<SelectValue placeholder={m.noRecord()} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{m.noRecord()}</SelectItem>
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
