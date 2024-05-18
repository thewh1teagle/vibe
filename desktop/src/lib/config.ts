import i18n from './i18n'

export const aboutURL = 'https://thewh1teagle.github.io/vibe/'
export const updateVersionURL = 'https://github.com/thewh1teagle/vibe/releases/latest'
export const modelsURL = 'https://huggingface.co/ggerganov/whisper.cpp'

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus']

export const preferences = {
	soundOnFinish: { key: 'prefs_sound_on_finish', default: true },
	focusOnFinish: { key: 'prefs_focus_on_finish', default: true },
	displayLanguage: { key: 'prefs_sound_on_finish', default: i18n.language },
	modealPath: { key: 'prefs_model_path', default: null },
}
