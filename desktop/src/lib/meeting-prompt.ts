import { invoke } from '@tauri-apps/api/core'

export type MeetingSource = 'meet' | 'zoom' | 'teams'

export interface MeetingPromptState {
	source: MeetingSource
}

export interface MeetingRecordingOptions {
	microphone: boolean
	systemAudio: boolean
}

export const getMeetingDetectionEnabled = () => invoke<boolean>('get_meeting_detection_enabled')

export const setMeetingDetectionEnabled = (enabled: boolean) => invoke<void>('set_meeting_detection_enabled', { enabled })

export const getMeetingPromptState = () => invoke<MeetingPromptState | null>('get_meeting_prompt_state')

export const dismissMeetingPrompt = () => invoke<void>('dismiss_meeting_prompt')

export const meetingPromptReady = () => invoke<void>('meeting_prompt_ready')
