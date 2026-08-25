import { type RefObject, useCallback, useEffect } from 'react'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { usePersisted } from '~/lib/config-store'

export const PLAYBACK_RATES = [1, 1.5, 2] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

function isPlaybackRate(value: number): value is PlaybackRate {
	return PLAYBACK_RATES.some((rate) => rate === value)
}

export function nextPlaybackRate(current: number): PlaybackRate {
	const index = PLAYBACK_RATES.indexOf(isPlaybackRate(current) ? current : 1)
	return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
}

/** A single global, persisted playback rate shared by every audio player. */
export function usePlaybackRate(audioRef: RefObject<HTMLAudioElement | null>, audioKey: unknown) {
	const [storedRate, setStoredRate] = usePersisted<number>(CONFIG_KEYS.playbackRate, 1)
	const playbackRate: PlaybackRate = isPlaybackRate(storedRate) ? storedRate : 1

	// Reapply when either the preference or the audio instance changes. `audioKey` represents players
	// that replace the element behind a stable ref (the transcript player does this for each track).
	useEffect(() => {
		const audio = audioRef.current
		if (!audio) return
		audio.preservesPitch = true
		audio.playbackRate = playbackRate
	}, [audioKey, audioRef, playbackRate])

	useEffect(() => {
		if (storedRate !== playbackRate) setStoredRate(playbackRate)
	}, [playbackRate, setStoredRate, storedRate])

	const cyclePlaybackRate = useCallback(() => {
		setStoredRate(nextPlaybackRate)
	}, [setStoredRate])

	return { playbackRate, cyclePlaybackRate }
}
