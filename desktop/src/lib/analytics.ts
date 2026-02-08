import { trackEvent } from '@aptabase/tauri'

export const analyticsEvents = {
	TRANSCRIBE_STARTED: 'transcribe_started',
	TRANSCRIBE_SUCCEEDED: 'transcribe_succeeded',
	TRANSCRIBE_FAILED: 'transcribe_failed',
} as const

type AnalyticsProps = Record<string, string | number>

export function trackAnalyticsEvent(eventName: string, props?: AnalyticsProps) {
	try {
		trackEvent(eventName, props)
	} catch (error) {
		console.debug('analytics track failed', error)
	}
}
