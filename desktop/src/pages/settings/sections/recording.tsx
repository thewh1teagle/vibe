import { invoke } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import ShortcutRecorder from '~/components/shortcut-recorder'
import { MeetingServiceIcons } from '~/components/meeting-service-icons'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { getDefaultRecordingShortcut } from '~/lib/config'
import type { PermissionStatus } from '~/lib/permissions'
import { m } from '~/paraglide/messages.js'
import { useRecordingShortcut } from '~/providers/recording-shortcut'
import { usePreferenceProvider } from '~/providers/preference'
import { SettingsGroup, SettingsRow } from './shared'

type PermissionKind = 'microphone' | 'system_audio'

const statusLabels: Record<PermissionStatus, () => string> = {
	granted: m.permissionGranted,
	denied: m.permissionDenied,
	not_determined: m.permissionNotDetermined,
	restricted: m.permissionRestricted,
	not_applicable: m.permissionNotApplicable,
}

export function normalizePermissionStatus(value: PermissionStatus | boolean): PermissionStatus {
	if (typeof value === 'boolean') return value ? 'granted' : 'denied'
	return value
}

function PermissionRow({ kind, label, description }: { kind: PermissionKind; label: string; description: string }) {
	const [status, setStatus] = useState<PermissionStatus | null>(null)
	const [checking, setChecking] = useState(true)
	const statusCommand = kind === 'microphone' ? 'get_microphone_permission_status' : 'get_system_audio_permission_status'
	const requestCommand = kind === 'microphone' ? 'request_microphone_permission' : 'request_system_audio_permission'
	const settingsCommand = kind === 'microphone' ? 'open_microphone_settings' : 'open_system_audio_settings'

	const refresh = useCallback(async () => {
		setChecking(true)
		try {
			setStatus(await invoke<PermissionStatus>(statusCommand))
		} catch (error) {
			console.error(`Could not check ${kind} permission:`, error)
			setStatus(null)
		} finally {
			setChecking(false)
		}
	}, [kind, statusCommand])

	useEffect(() => {
		void refresh()
		window.addEventListener('focus', refresh)
		return () => window.removeEventListener('focus', refresh)
	}, [refresh])

	async function requestAccess() {
		setChecking(true)
		try {
			const result = await invoke<PermissionStatus | boolean>(requestCommand)
			setStatus(normalizePermissionStatus(result))
		} catch (error) {
			console.error(`Could not request ${kind} permission:`, error)
			toast.error(m.permissionCheckFailed(), { description: String(error) })
		} finally {
			setChecking(false)
		}
	}

	async function openSettings() {
		try {
			await invoke(settingsCommand)
		} catch (error) {
			console.error(`Could not open ${kind} settings:`, error)
			toast.error(m.permissionCheckFailed(), { description: String(error) })
		}
	}

	const showSettings = status === 'denied' || status === 'restricted'
	// The system-audio preflight API cannot distinguish "never asked" from denied, so keep the
	// request action available there; a denied microphone has a precise status and goes to Settings.
	const showRequest = status === 'not_determined' || status === null || (kind === 'system_audio' && status === 'denied')

	return (
		<SettingsRow label={label} description={description}>
			<span className="text-xs text-muted-foreground">
				{checking ? m.permissionChecking() : status ? statusLabels[status]() : m.permissionCheckFailed()}
			</span>
			{showRequest && (
				<Button variant="outline" size="sm" disabled={checking} onClick={requestAccess}>
					{m.requestPermission()}
				</Button>
			)}
			{showSettings && (
				<Button variant="outline" size="sm" disabled={checking} onClick={openSettings}>
					{m.openSystemSettings()}
				</Button>
			)}
		</SettingsRow>
	)
}

export function RecordingSection() {
	const shortcut = useRecordingShortcut()
	const { meetingDetectionEnabled, setMeetingDetectionEnabled, autoTranscribeAfterRecording, setAutoTranscribeAfterRecording } = usePreferenceProvider()
	const isMacOS = platform() === 'macos'

	return (
		<div className="space-y-6">
			<SettingsGroup title={m.meetingDetection()} description={m.meetingDetectionInfo()}>
				<SettingsRow label={<MeetingServiceIcons label={m.supportedMeetingServices()} />} clampDescription={false}>
					<Switch checked={meetingDetectionEnabled} onCheckedChange={setMeetingDetectionEnabled} aria-label={m.meetingDetection()} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title={m.recordingControls()} description={m.recordingSettingsInfo()}>
				<SettingsRow label={m.autoTranscribeAfterRecording()} description={m.autoTranscribeAfterRecordingInfo()} clampDescription={false}>
					<Switch
						checked={autoTranscribeAfterRecording}
						onCheckedChange={setAutoTranscribeAfterRecording}
						aria-label={m.autoTranscribeAfterRecording()}
					/>
				</SettingsRow>
				<SettingsRow label={m.recordingShortcutEnabled()} description={m.recordingShortcutEnabledInfo()}>
					<Switch checked={shortcut.recordingShortcutEnabled} onCheckedChange={shortcut.setRecordingShortcutEnabled} />
				</SettingsRow>
				{shortcut.recordingShortcutEnabled && (
					<SettingsRow label={m.recordingShortcut()} description={m.recordingShortcutInfo()}>
						<ShortcutRecorder
							value={shortcut.recordingShortcut}
							onChange={shortcut.setRecordingShortcut}
							defaultValue={getDefaultRecordingShortcut()}
							onCapturingChange={shortcut.setRecordingShortcutCapturing}
						/>
					</SettingsRow>
				)}
			</SettingsGroup>

			{isMacOS && (
				<SettingsGroup title={m.recordingPermissions()}>
					<PermissionRow kind="microphone" label={m.microphonePermission()} description={m.microphonePermissionInfo()} />
					<PermissionRow kind="system_audio" label={m.systemAudioPermission()} description={m.systemAudioPermissionInfo()} />
				</SettingsGroup>
			)}
		</div>
	)
}
