export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
}

/** The microphone picked on the home page, or the system default when none was picked. */
export function selectInputDevice(devices: AudioDevice[], savedId: string | null): AudioDevice | null {
	const inputs = devices.filter((device) => device.isInput)
	return inputs.find((device) => (savedId === null ? device.isDefault : device.id === savedId)) ?? null
}
