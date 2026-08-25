import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { Check, Mic, Volume2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { GoogleMeetIcon, MicrosoftTeamsIcon, ZoomIcon } from '~/components/meeting-service-icons'
import { Button } from '~/components/ui/button'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig } from '~/lib/config-store'
import {
	dismissMeetingPrompt,
	getMeetingPromptState,
	meetingPromptReady,
	type MeetingPromptState,
	type MeetingRecordingOptions,
	type MeetingSource,
} from '~/lib/meeting-prompt'
import { supportedLanguages } from '~/lib/i18n'
import { cn } from '~/lib/style'
import { m } from '~/paraglide/messages.js'
import { getLocale, getTextDirection, setLocale } from '~/paraglide/runtime.js'
import logoUrl from '../../../design/logo.svg?url'

const serviceNames: Record<MeetingSource, string> = {
	meet: 'Google Meet',
	zoom: 'Zoom',
	teams: 'Microsoft Teams',
}

function ServiceIcon({ source }: { source: MeetingSource }) {
	const className = 'h-7 w-7'
	if (source === 'meet') return <GoogleMeetIcon className={className} />
	if (source === 'zoom') return <ZoomIcon className={className} />
	return <MicrosoftTeamsIcon className={className} />
}

function SourceChoice({
	checked,
	icon: Icon,
	label,
	disabled,
	onClick,
}: {
	checked: boolean
	icon: typeof Mic
	label: string
	disabled: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			aria-pressed={checked}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50',
				checked ? 'border-border bg-muted/35 text-foreground' : 'border-border/75 bg-transparent text-muted-foreground',
			)}>
			<span
				className={cn(
					'flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border',
					checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/55',
				)}>
				{checked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
			</span>
			<Icon className="h-3 w-3" />
			<span>{label}</span>
		</button>
	)
}

export default function MeetingPromptWindow() {
	const configuredLocale = readConfig(CONFIG_KEYS.displayLanguage, 'en-US')
	if (supportedLanguages[configuredLocale] && configuredLocale !== getLocale()) {
		setLocale(configuredLocale as never, { reload: false })
	}

	const [state, setState] = useState<MeetingPromptState | null>(null)
	const [busy, setBusy] = useState(false)
	const [sources, setSources] = useState<MeetingRecordingOptions>({ microphone: true, systemAudio: true })
	const theme = readConfig<'light' | 'dark'>(CONFIG_KEYS.theme, window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
	const direction = getTextDirection(configuredLocale)

	useLayoutEffect(() => {
		document.title = m.appTitle()
		document.body.dir = direction
		document.documentElement.classList.toggle('dark', theme === 'dark')
		document.documentElement.classList.add('meeting-prompt-window')
		document.documentElement.style.background = 'transparent'
		document.body.style.background = 'transparent'
		void getCurrentWebviewWindow()
			.setTheme(theme)
			.catch(() => undefined)
		return () => {
			document.documentElement.classList.remove('meeting-prompt-window')
			document.documentElement.style.removeProperty('background')
			document.body.style.removeProperty('background')
		}
	}, [direction, theme])

	useEffect(() => {
		let cancelled = false
		const unlisten = listen<MeetingPromptState>('meeting-prompt-state', ({ payload }) => {
			if (!cancelled) setState(payload)
		})
		void (async () => {
			try {
				const initialState = await getMeetingPromptState()
				if (!cancelled) setState(initialState)
			} catch (error) {
				console.error('Failed to initialize meeting prompt:', error)
			}
			await meetingPromptReady().catch((error) => console.error('Failed to mark meeting prompt ready:', error))
		})()
		return () => {
			cancelled = true
			unlisten.then((dispose) => dispose())
		}
	}, [])

	useEffect(() => {
		const unlisten = listen<{ started: boolean }>('meeting-prompt-recording-result', ({ payload }) => {
			setBusy(false)
			if (payload.started) setState(null)
		})
		return () => {
			unlisten.then((dispose) => dispose())
		}
	}, [])

	useEffect(() => {
		if (!state) return
		const timeout = window.setTimeout(() => {
			void dismissMeetingPrompt()
				.catch((error) => console.error('Failed to auto-dismiss meeting prompt:', error))
				.finally(() => setState(null))
		}, 10_000)
		return () => window.clearTimeout(timeout)
	}, [state])

	async function dismiss() {
		if (busy) return
		setBusy(true)
		try {
			await dismissMeetingPrompt()
			setState(null)
		} catch (error) {
			console.error('Failed to dismiss meeting prompt:', error)
			setBusy(false)
		}
	}

	async function startRecording() {
		if (busy) return
		setBusy(true)
		try {
			await emit('meeting-prompt-start-recording', sources)
		} catch (error) {
			console.error('Failed to start recording from meeting prompt:', error)
			setBusy(false)
		}
	}

	function toggleSource(source: keyof MeetingRecordingOptions) {
		setSources((current) => {
			if (current[source] && Object.values(current).filter(Boolean).length === 1) return current
			return { ...current, [source]: !current[source] }
		})
	}

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') void dismiss()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	})

	if (!state) return null

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-transparent p-2">
			<section className="flex h-full w-full flex-col gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-card-foreground shadow-xl">
				<div className="flex min-w-0 items-center gap-2.5">
					<div className="relative flex h-9 w-12 shrink-0 items-center">
						<ServiceIcon source={state.source} />
						<img src={logoUrl} alt="" className="absolute end-0 h-5 w-5 rounded-full border-2 border-card" />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-sm font-semibold leading-5">{m.meetingPromptTitle({ source: serviceNames[state.source] })}</h1>
						<p className="truncate text-xs text-muted-foreground">{m.meetingPromptDescription()}</p>
					</div>
				</div>
				<div className="flex gap-1.5" aria-label={m.recordingControls()}>
					<SourceChoice
						checked={sources.microphone}
						icon={Mic}
						label={m.microphone()}
						disabled={busy}
						onClick={() => toggleSource('microphone')}
					/>
					<SourceChoice
						checked={sources.systemAudio}
						icon={Volume2}
						label={m.systemAudioPermission()}
						disabled={busy}
						onClick={() => toggleSource('systemAudio')}
					/>
				</div>
				<div className="mt-auto flex justify-end gap-1.5 border-t border-border/55 pt-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 rounded-md px-2 text-xs"
						disabled={busy}
						onClick={() => void dismiss()}>
						{m.meetingPromptDismiss()}
					</Button>
					<Button
						type="button"
						size="sm"
						className="h-8 rounded-md px-3 text-xs"
						disabled={busy}
						onClick={() => void startRecording()}>
						{m.meetingPromptStart()}
					</Button>
				</div>
			</section>
		</div>
	)
}
