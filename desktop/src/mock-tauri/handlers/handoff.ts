import { emitMockEvent } from '../event-bus'

// Browser-only pairing state. These demo codes do not connect to a real computer.
let enabled = false
let generation = 0
let devices: { id: string; name: string; pairedAt: string }[] = []
const endpointId = '0'.repeat(64)

function status() {
	return {
		enabled,
		endpointId: enabled ? endpointId : null,
		pairingId: enabled ? `demo-${generation}` : null,
		pairingUrl: enabled ? `https://thewh1teagle.github.io/vibe/phone/#${endpointId}:${String(generation).padStart(32, '0')}` : null,
		devices: [...devices],
	}
}

/** Simulate a phone completing pairing when previewing the settings in a browser. */
export function pairMockPhone(name = 'iPhone') {
	if (!enabled) return
	const pairingId = `demo-${generation}`
	const device = { id: crypto.randomUUID(), name, pairedAt: new Date().toISOString() }
	devices = [...devices, device]
	generation += 1
	emitMockEvent('handoff_paired', { pairingId, device })
}

export const handoffHandlers = {
	handoff_status: status,
	handoff_start: () => {
		enabled = true
		return status()
	},
	handoff_stop: () => {
		enabled = false
	},
	handoff_regenerate_token: () => {
		generation += 1
		return status()
	},
	handoff_revoke_device: ({ deviceId }: Record<string, unknown>) => {
		devices = devices.filter((device) => device.id !== deviceId)
		return status()
	},
	handoff_revoke_all: () => {
		devices = []
		generation += 1
		return status()
	},
}
