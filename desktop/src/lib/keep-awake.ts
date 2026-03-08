import * as keepAwake from 'tauri-plugin-keepawake-api'

export async function startKeepAwake() {
	try {
		keepAwake.start({ display: true, idle: true, sleep: true })
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

export async function stopKeepAwake() {
	try {
		keepAwake.stop()
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}
