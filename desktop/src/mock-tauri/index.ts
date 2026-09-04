import { installRuntime } from './runtime'
import { pluginHandlers } from './handlers/plugins'
import { pathHandlers } from './handlers/path'
import { serverHandlers } from './handlers/server'
import { mediaMiscHandlers } from './handlers/media-misc'

// Commands with no dedicated handler group.
const extraHandlers = {
	keepawake_start: () => undefined,
	keepawake_stop: () => undefined,
}

// Entry point for browser mock mode. Must run before any app module is imported
// (some modules call Tauri APIs at import time).
export function installMockTauri() {
	installRuntime({ ...pluginHandlers, ...pathHandlers, ...serverHandlers, ...mediaMiscHandlers, ...extraHandlers })
}
