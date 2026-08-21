import { installRuntime } from './runtime'
import { pluginHandlers } from './handlers/plugins'
import { pathHandlers } from './handlers/path'
import { sonaHandlers } from './handlers/sona'
import { mediaMiscHandlers } from './handlers/media-misc'

// Third-party plugins with no dedicated handler group.
const extraHandlers = {
	'plugin:keepawake|start': () => undefined,
	'plugin:keepawake|stop': () => undefined,
}

// Entry point for browser mock mode. Must run before any app module is imported
// (some modules call Tauri APIs at import time).
export function installMockTauri() {
	installRuntime({ ...pluginHandlers, ...pathHandlers, ...sonaHandlers, ...mediaMiscHandlers, ...extraHandlers })
}
