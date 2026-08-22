import { useCallback, useEffect, useState } from 'react'

const DISMISSED_KEY = 'vibe.handoff.installDismissed'

/** The Chromium-only event; not in lib.dom, so declare the shape we use. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMode = 'none' | 'prompt' | 'ios-manual'

/** Already running as an installed app? Then there is nothing to suggest. */
export function isStandalone(): boolean {
	const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
	const displayMode = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches
	return iosStandalone || displayMode
}

function isIosSafari(): boolean {
	const ua = navigator.userAgent
	// iPadOS 13+ reports a desktop UA, so also treat a touch-capable "Mac" as iOS.
	const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	if (!ios) return false
	// Chrome/Firefox/Edge on iOS cannot install to the home screen at all.
	return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

/**
 * Home-screen install affordance.
 *
 * Chromium fires `beforeinstallprompt`, which we capture and replay behind our
 * own control. iOS Safari has no such event — installing is a manual Share →
 * Add to Home Screen gesture — so there we show instructions instead.
 */
export function useInstall() {
	const [mode, setMode] = useState<InstallMode>('none')
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

	useEffect(() => {
		if (isStandalone()) return

		let dismissed = false
		try {
			dismissed = localStorage.getItem(DISMISSED_KEY) === '1'
		} catch {
			/* private mode */
		}
		if (dismissed) return

		const onBeforeInstall = (event: Event) => {
			event.preventDefault()
			setDeferred(event as BeforeInstallPromptEvent)
			setMode('prompt')
		}
		const onInstalled = () => {
			setMode('none')
			setDeferred(null)
			try {
				localStorage.setItem(DISMISSED_KEY, '1')
			} catch {
				/* private mode */
			}
		}

		window.addEventListener('beforeinstallprompt', onBeforeInstall)
		window.addEventListener('appinstalled', onInstalled)

		if (isIosSafari()) setMode('ios-manual')

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall)
			window.removeEventListener('appinstalled', onInstalled)
		}
	}, [])

	/** Never nag: a dismissal is remembered for good. */
	const dismiss = useCallback(() => {
		setMode('none')
		setDeferred(null)
		try {
			localStorage.setItem(DISMISSED_KEY, '1')
		} catch {
			/* private mode */
		}
	}, [])

	const install = useCallback(async () => {
		if (!deferred) return
		await deferred.prompt()
		const { outcome } = await deferred.userChoice
		if (outcome === 'dismissed') dismiss()
		else {
			setMode('none')
			setDeferred(null)
		}
	}, [deferred, dismiss])

	return { mode, install, dismiss }
}

/**
 * Ask the browser to keep our storage. The pairing lives entirely in
 * localStorage, and WebKit evicts script-written storage from origins that go
 * unused. Persistence is granted on heuristics — being an installed home-screen
 * web app is one of them — so this is best-effort and never blocks anything.
 */
export async function requestPersistentStorage(): Promise<void> {
	try {
		if (navigator.storage?.persist && navigator.storage.persisted) {
			if (!(await navigator.storage.persisted())) await navigator.storage.persist()
		}
	} catch {
		/* unsupported or refused — nothing to do */
	}
}
