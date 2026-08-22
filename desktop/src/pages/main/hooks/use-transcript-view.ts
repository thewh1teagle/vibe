import { useLocalStorage } from 'usehooks-ts'

export type TranscriptTextSize = 'sm' | 'md' | 'lg'

/** Which of the two readings of a job is on screen. */
export type TranscriptTab = 'transcript' | 'summary'

export interface TranscriptViewOptions {
	textSize: TranscriptTextSize
	setTextSize: (size: TranscriptTextSize) => void
	showTimestamps: boolean
	setShowTimestamps: (value: boolean) => void
	showSpeakers: boolean
	setShowSpeakers: (value: boolean) => void
}

/** Reading preferences for the transcript page — they belong to the view, not to a transcription run. */
export function useTranscriptViewOptions(): TranscriptViewOptions {
	const [textSize, setTextSize] = useLocalStorage<TranscriptTextSize>('prefs_transcript_text_size', 'md')
	const [showTimestamps, setShowTimestamps] = useLocalStorage<boolean>('prefs_transcript_show_timestamps', true)
	const [showSpeakers, setShowSpeakers] = useLocalStorage<boolean>('prefs_transcript_show_speakers', true)
	return { textSize, setTextSize, showTimestamps, setShowTimestamps, showSpeakers, setShowSpeakers }
}

/** Type scale for the transcript body; the editor reuses it so swapping one for the other is invisible. */
export const textSizeClass: Record<TranscriptTextSize, string> = {
	sm: 'text-[13px] leading-[1.7]',
	md: 'text-[15px] leading-[1.75]',
	lg: 'text-[17px] leading-[1.8]',
}
