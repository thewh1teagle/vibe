import { invoke } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'

/**
 * Ensures system audio recording permission is granted on macOS.
 * - Already granted: returns true immediately
 * - First time: shows native macOS prompt, waits for user response
 * - Previously denied: opens System Settings, shows toast, returns false
 *
 * Returns true if permission is granted and recording can proceed.
 * No-op on non-macOS platforms (always returns true).
 */
export async function ensureSystemAudioPermission(): Promise<boolean> {
  if (platform() !== 'macos') {
    return true
  }

  const granted = await invoke<boolean>('request_system_audio_permission')
  if (granted) {
    return true
  }

  await invoke('open_system_audio_settings')
	toast.error(m.permissionAudioRecording())
  return false
}

/**
 * Returns true if microphone access is granted. Checks silently, without
 * prompting. Always true on non-macOS platforms.
 */
export async function isMicrophoneGranted(): Promise<boolean> {
  if (platform() !== 'macos') {
    return true
  }
  return invoke<boolean>('microphone_permission_granted')
}

/**
 * Ensures microphone permission on macOS. Shows the native prompt on first
 * request; if previously denied, opens System Settings and returns false.
 * Returns true when access is granted. No-op (true) on non-macOS platforms.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (platform() !== 'macos') {
    return true
  }
  if (await invoke<boolean>('microphone_permission_granted')) {
    return true
  }
  const granted = await invoke<boolean>('request_microphone_permission')
  if (granted) {
    return true
  }
  await invoke('open_microphone_settings')
  return false
}

/**
 * Returns true if Accessibility permission is granted (required by enigo to
 * type at the cursor). Checks silently, without prompting. Always true on
 * non-macOS platforms.
 */
export async function isAccessibilityGranted(): Promise<boolean> {
  if (platform() !== 'macos') {
    return true
  }
  return invoke<boolean>('accessibility_permission_granted')
}

/**
 * Requests Accessibility permission. On macOS, opens the native prompt that
 * deep-links to System Settings when not yet trusted. Returns true if already
 * granted. Granting usually requires restarting the app to take effect.
 * No-op (returns true) on non-macOS platforms.
 */
export async function requestAccessibility(): Promise<boolean> {
  if (platform() !== 'macos') {
    return true
  }
  return invoke<boolean>('request_accessibility_permission')
}
