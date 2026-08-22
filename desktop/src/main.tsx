// Entry point. The imports below are dynamic on purpose: app modules call Tauri APIs at
// import time, so nothing may be evaluated before the browser-mode mock is installed.
async function boot() {
	if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
		const { installMockTauri } = await import('./mock-tauri')
		installMockTauri()
	}
	await import('./bootstrap')
}

boot()
