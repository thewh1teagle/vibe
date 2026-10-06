export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
}

export function selectInputDevice(devices: AudioDevice[], savedId: string | null): AudioDevice | null {
	const inputs = devices.filter((device) => device.isInput)
	return savedId === null ? (inputs.find((device) => device.isDefault) ?? null) : (inputs.find((device) => device.id === savedId) ?? null)
}
