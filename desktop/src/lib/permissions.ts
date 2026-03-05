import { invoke } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'
import { toast } from 'sonner'

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

  const granted = await invoke<boolean>('check_system_audio_permission')
  if (granted) {
    return true
  }

  const requested = await invoke<boolean>('request_system_audio_permission')
  if (requested) {
    return true
  }

  await invoke('open_system_audio_settings')
  toast.error('Please enable system audio recording in System Settings, then try again.')
  return false
}
