import { invoke } from '@tauri-apps/api/core'

export const analyticsEvents = {
	TRANSCRIBE_STARTED: 'transcribe_started',
	TRANSCRIBE_SUCCEEDED: 'transcribe_succeeded',
	TRANSCRIBE_FAILED: 'transcribe_failed',
} as const

type AnalyticsProps = Record<string, string | number>

export function trackAnalyticsEvent(eventName: string, props?: AnalyticsProps) {
	void invoke('track_analytics_event', {
		name: eventName,
		props,
	}).catch((error) => {
		console.debug('analytics track failed', error)
	})
}
