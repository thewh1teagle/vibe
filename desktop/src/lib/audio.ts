export interface AudioDevice {
	isDefault: boolean
	isInput: boolean
	id: string
	name: string
}

/** Names that go through PipeWire and actually open under exclusive hw: locks. */
const PIPEWIRE_INPUT_PREFERENCE = /Default ALSA Output \(currently PipeWire Media Server\)|PipeWire Sound Server|PulseAudio Sound Server/i

/** Raw ALSA/HDMI/plugin entries that cpal cannot open (or capture silence). */
const UNUSABLE_INPUT = /Rate Converter|Open Sound System|Discard all samples|HDMI|IEC958|Null|Modem/i

export function findDefaultInputDevice(devices: AudioDevice[], savedId?: string | null): AudioDevice | null {
	const inputs = devices.filter((device) => device.isInput)
	if (savedId) {
		const saved = inputs.find((device) => device.id === savedId)
		if (saved) return saved
	}
	const marked = inputs.find((device) => device.isDefault)
	if (marked) return marked
	const pipewire = inputs.find((device) => PIPEWIRE_INPUT_PREFERENCE.test(device.name))
	if (pipewire) return pipewire
	return inputs.find((device) => !UNUSABLE_INPUT.test(device.name)) ?? inputs[0] ?? null
}
