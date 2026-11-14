// Entry point. The imports below are dynamic on purpose: app modules call Tauri APIs at
// import time, so nothing may be evaluated before the browser-mode mock is installed.
// Anything the Content-Security-Policy blocks is kept here, so a test (or a bug report) can read
// what was refused instead of guessing from a blank area. First thing in the entry on purpose.
const cspViolations: { directive: string; blocked: string; source: string }[] = []
;(window as unknown as { __cspViolations: typeof cspViolations }).__cspViolations = cspViolations
document.addEventListener('securitypolicyviolation', (event) => {
	cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI, source: `${event.sourceFile}:${event.lineNumber}` })
	console.error('[csp] blocked', event.effectiveDirective, event.blockedURI)
})

async function boot() {
	if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
		const { installMockTauri } = await import('./mock-tauri')
		installMockTauri()
	}
	await import('./bootstrap')
}

boot()
