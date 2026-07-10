import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle, Check, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../design/logo.svg?url'
import { getDictationIndicatorState, type DictationIndicatorState } from '~/lib/dictation-indicator'

export default function DictationIndicator() {
	const { t } = useTranslation()
	const [state, setState] = useState<DictationIndicatorState>({ sessionId: 0, status: 'recording' })

	useEffect(() => {
		invoke('dictation_indicator_ready').catch(console.error)
		getDictationIndicatorState().then((initialState) => {
			if (initialState) setState(initialState)
		}).catch(console.error)
		const unlisten = listen<DictationIndicatorState>('dictation-indicator-state', ({ payload }) => setState(payload))
		return () => {
			unlisten.then((stop) => stop())
		}
	}, [])

	const content = {
		recording: { icon: <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.18)]" />, label: t('common.dictation-indicator-listening') },
		transcribing: { icon: <LoaderCircle className="h-4 w-4 animate-spin text-blue-400" />, label: t('common.dictation-indicator-transcribing') },
		completed: { icon: <Check className="h-4 w-4 text-emerald-400" />, label: t(state.output === 'type' ? 'common.dictation-indicator-inserted' : 'common.dictation-indicator-copied') },
		error: { icon: <AlertTriangle className="h-4 w-4 text-red-400" />, label: state.message || t('common.dictation-indicator-error') },
	}[state.status]

	return (
		<div className="flex h-screen w-screen items-center justify-center p-2">
			<div className="flex h-12 min-w-56 max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-zinc-950 px-3.5 text-sm font-medium text-zinc-50 shadow-[0_12px_35px_rgba(0,0,0,0.32),0_2px_8px_rgba(0,0,0,0.22)]">
				<img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full" />
				<span className="h-5 w-px bg-white/12" />
				<span className="shrink-0">{content.icon}</span>
				<span className="truncate">{content.label}</span>
			</div>
		</div>
	)
}
