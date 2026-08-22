import { useCallback, useEffect, useRef } from 'react'

/**
 * Screen wake lock for the whole handoff operation — recording, upload, and the
 * wait for the desktop's transcript. Transcription on a large model runs for
 * tens of seconds, and on iOS a sleeping screen suspends the page and drops the
 * relay connection, so the lock must outlive the recording itself.
 *
 * Two facts drive the shape of this hook:
 *  - The spec releases the lock whenever the document becomes hidden, and never
 *    restores it. So we track whether a lock is still *wanted* and re-acquire on
 *    the way back to visible.
 *  - `request()` rejects when the document is hidden, on low battery, and in
 *    browsers without support. None of that may break a recording, so every
 *    call is guarded and failure is silent.
 */
export function useWakeLock() {
	const lockRef = useRef<WakeLockSentinel | null>(null)
	const wantedRef = useRef(false)

	const acquire = useCallback(async () => {
		wantedRef.current = true
		if (lockRef.current) return
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
		try {
			if (!navigator.wakeLock?.request) return
			const lock = await navigator.wakeLock.request('screen')
			// Released while we were awaiting: honour that, do not leak the lock.
			if (!wantedRef.current) {
				void lock.release()
				return
			}
			lockRef.current = lock
			lock.addEventListener('release', () => {
				if (lockRef.current === lock) lockRef.current = null
			})
		} catch {
			lockRef.current = null
		}
	}, [])

	const release = useCallback(() => {
		wantedRef.current = false
		const lock = lockRef.current
		lockRef.current = null
		if (lock) {
			try {
				void lock.release()
			} catch {
				/* already released */
			}
		}
	}, [])

	/** After the page becomes visible again, take the lock back if still needed. */
	const reacquireIfWanted = useCallback(() => {
		if (wantedRef.current && !lockRef.current) void acquire()
	}, [acquire])

	/** Test/diagnostic view of the current state. */
	const isHeld = useCallback(() => lockRef.current !== null, [])

	// A leaked screen lock is its own bug: drop it if we unmount mid-operation.
	useEffect(() => {
		return () => {
			wantedRef.current = false
			const lock = lockRef.current
			lockRef.current = null
			if (lock) {
				try {
					void lock.release()
				} catch {
					/* already released */
				}
			}
		}
	}, [])

	return { acquire, release, reacquireIfWanted, isHeld }
}
