import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import { storeFilename } from '~/lib/config'

export const analyticsEvents = {
	TRANSCRIBE_STARTED: 'transcribe_started',
	TRANSCRIBE_SUCCEEDED: 'transcribe_succeeded',
	TRANSCRIBE_FAILED: 'transcribe_failed',
} as const

type AnalyticsProps = Record<string, string | number>

export async function trackAnalyticsEvent(eventName: string, props?: AnalyticsProps) {
	try {
		const store = await load(storeFilename)
		const enabled = await store.get<boolean>('analytics_enabled')
		if (enabled === false) {
			return
		}
	} catch {
		// If store fails, proceed with tracking
	}
	void invoke('track_analytics_event', {
		name: eventName,
		props,
	}).catch((error) => {
		console.debug('analytics track failed', error)
	})
}
