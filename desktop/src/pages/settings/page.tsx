import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { m } from '~/paraglide/messages.js'
import {
	ArrowLeft,
	ArrowUpRight,
	Bot,
	Cpu,
	Globe,
	Keyboard,
	Mic,
	ShieldCheck,
	SlidersHorizontal,
	Smartphone,
	Sparkles,
	Terminal,
	Wrench,
	X,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import * as config from '~/lib/config'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { ModifyState } from '~/lib/types'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import { AdvancedSection } from './sections/advanced'
import { AutoExportSection } from './sections/auto-export'
import { ApiSection } from './sections/api'
import { DictationSection } from './sections/dictation'
import { GeneralSection } from './sections/general'
import { ModelsSection } from './sections/models'
import { PhoneSection } from './sections/phone'
import { PrivacySection } from './sections/privacy'
import { RecordingSection } from './sections/recording'
import { AiSection, type AiTaskId } from './sections/ai'
import { AiPromptSection } from './sections/ai-prompt'
import { TranscriptionSection } from './sections/transcription'
import { TuningSection } from './sections/tuning'
import { WhisperOptionsSection } from './sections/whisper-options'
import { AudioProcessingSection } from './sections/audio-processing'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

type SectionId = 'general' | 'transcription' | 'models' | 'ai' | 'tuning' | 'recording' | 'dictation' | 'phone' | 'api' | 'privacy' | 'advanced'

type Subpage = 'auto-export' | 'ai-summary' | 'ai-dictation' | 'whisper-options' | 'audio-processing' | 'phone-pairing'

interface SettingsSection {
	id: SectionId
	label: string
	icon: ReactNode
}

/** Sidebar items, split into visually separated runs — no group headings. */
type SettingsGroup = SettingsSection[]

export default function SettingsPage({ setVisible, scrollTo }: SettingsPageProps) {
	const vm = viewModel()

	const groups: SettingsGroup[] = [
		[
			{ id: 'general', label: m.general(), icon: <Globe className="h-4 w-4" /> },
			{ id: 'privacy', label: m.privacy(), icon: <ShieldCheck className="h-4 w-4" /> },
		],
		[
			{ id: 'transcription', label: m.transcription(), icon: <SlidersHorizontal className="h-4 w-4" /> },
			{ id: 'models', label: m.navModels(), icon: <Bot className="h-4 w-4" /> },
			{ id: 'tuning', label: m.navTuning(), icon: <Cpu className="h-4 w-4" /> },
		],
		[
			{ id: 'recording', label: m.recordingSettings(), icon: <Mic className="h-4 w-4" /> },
			{ id: 'dictation', label: m.navDictation(), icon: <Keyboard className="h-4 w-4" /> },
			{ id: 'ai', label: m.aiSection(), icon: <Sparkles className="h-4 w-4" /> },
			{ id: 'phone', label: m.phone(), icon: <Smartphone className="h-4 w-4" /> },
		],
		[
			{ id: 'api', label: m.navAgents(), icon: <Terminal className="h-4 w-4" /> },
			{ id: 'advanced', label: m.advanced(), icon: <Wrench className="h-4 w-4" /> },
		],
	]
	const sections = groups.flat()

	// Pages under a section, each with its own title and a way back; no dialog over the modal.
	const subpages: Record<Subpage, { section: SectionId; title: string }> = {
		'whisper-options': { section: 'tuning', title: m.whisperOptions() },
		'audio-processing': { section: 'tuning', title: m.audioProcessing() },
		'auto-export': { section: 'transcription', title: m.autoExport() },
		'phone-pairing': { section: 'phone', title: m.pairAPhone() },
		'ai-summary': { section: 'ai', title: m.aiSummaryTask() },
		'ai-dictation': { section: 'ai', title: m.aiDictationTask() },
	}
	const isSubpage = (value: string | undefined): value is Subpage => value !== undefined && value in subpages
	const [activeSection, setActiveSection] = useState<SectionId>(
		isSubpage(scrollTo) ? subpages[scrollTo].section : sections.some((s) => s.id === scrollTo) ? (scrollTo as SectionId) : 'general',
	)
	const [subpage, setSubpage] = useState<Subpage | null>(isSubpage(scrollTo) ? scrollTo : null)
	const [animateInnerNavigation, setAnimateInnerNavigation] = useState(false)
	const reducedMotion = useReducedMotion()
	const contentRef = useRef<HTMLDivElement>(null)
	const viewportRef = useRef<HTMLDivElement>(null)
	const previousHeightRef = useRef<number | null>(null)
	const navigationSpring = reducedMotion || !animateInnerNavigation ? { duration: 0 } : { type: 'spring' as const, stiffness: 450, damping: 42, mass: 1 }

	useLayoutEffect(() => {
		const previousHeight = previousHeightRef.current
		previousHeightRef.current = null
		const viewport = viewportRef.current
		const content = contentRef.current
		if (previousHeight === null || !viewport || !content || reducedMotion) return
		// Only inner-page navigation animates; ordinary control changes use natural height.
		const animation = viewport.animate([{ height: `${previousHeight}px` }, { height: `${content.getBoundingClientRect().height}px` }], {
			duration: 240,
			easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
		})
		return () => animation.cancel()
	}, [activeSection, subpage, reducedMotion])

	function goTo(section: SectionId) {
		previousHeightRef.current = null
		setAnimateInnerNavigation(false)
		setSubpage(null)
		setActiveSection(section)
	}
	function navigateInside(page: Subpage | null) {
		previousHeightRef.current = viewportRef.current?.getBoundingClientRect().height ?? null
		setAnimateInnerNavigation(true)
		setSubpage(page)
	}
	function openSubpage(page: Subpage) {
		setActiveSection(subpages[page].section)
		navigateInside(page)
	}
	const openPrompt = (task: AiTaskId) => openSubpage(task === 'summary' ? 'ai-summary' : 'ai-dictation')

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<div
				onMouseDown={(event) => event.stopPropagation()}
				className="flex h-[640px] max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
				<div className="flex w-56 shrink-0 flex-col border-r border-border/55 bg-muted/40 p-3">
					<div className="mb-2 flex items-center justify-between px-1 pb-1">
						<span className="text-sm font-semibold">{m.settings()}</span>
						<Button onMouseDown={() => setVisible(false)} variant="ghost" size="iconSm" className="h-7 w-7 rounded-lg">
							<X className="h-4 w-4" />
						</Button>
					</div>
					<nav aria-label={m.settings()} className="flex-1 overflow-y-auto">
						{groups.map((group, index) => (
							<div key={group[0].id} className={`space-y-0.5 ${index > 0 ? 'mt-3 border-t border-border/50 pt-3' : ''}`}>
								{group.map((section) => (
									<button
										key={section.id}
										type="button"
										aria-current={activeSection === section.id ? 'page' : undefined}
										onClick={() => goTo(section.id)}
										className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium ${
											activeSection === section.id
												? 'bg-primary/10 text-primary'
												: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
										}`}>
										<span className={activeSection === section.id ? 'text-primary' : 'text-muted-foreground'}>{section.icon}</span>
										<span className="truncate">{section.label}</span>
									</button>
								))}
							</div>
						))}
					</nav>
					{/* The version is also the way into its own release notes — one line, not two affordances. */}
					<div className="mt-2 border-t border-border/55 pt-3">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => openUrl(config.changelogURL(vm.appVersionNumber))}
									className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 transition-colors hover:text-foreground">
									<span className="truncate">{vm.appVersion}</span>
									<ArrowUpRight
										aria-hidden="true"
										className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
										strokeWidth={2}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="top">{m.whatsNew()}</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="min-w-0 flex-1 overflow-y-auto p-6">
					<div className="mb-5 flex items-center border-b border-border/55 pb-3">
						<AnimatePresence initial={false}>
							{subpage && (
								<motion.div
									key="back"
									initial={{ width: 0 }}
									animate={{ width: 32 }}
									exit={{ width: 0 }}
									transition={navigationSpring}
									className="shrink-0 overflow-hidden">
									<Button
										variant="ghost"
										size="iconSm"
										className="h-7 w-6 rounded-lg"
										onClick={() => navigateInside(null)}
										aria-label={m.back()}>
										<ArrowLeft className="h-4 w-4" />
									</Button>
								</motion.div>
							)}
						</AnimatePresence>
						<h2 className="text-xl font-semibold">{subpage ? subpages[subpage].title : sections.find((s) => s.id === activeSection)?.label}</h2>
					</div>
					<div ref={viewportRef} className="overflow-hidden">
						<div ref={contentRef} className="flow-root">
							{subpage === 'whisper-options' && <WhisperOptionsSection vm={vm} />}
							{subpage === 'audio-processing' && <AudioProcessingSection vm={vm} />}
							{subpage === 'auto-export' && <AutoExportSection vm={vm} />}
							{subpage === 'ai-summary' && <AiPromptSection vm={vm} task="summary" />}
							{subpage === 'ai-dictation' && <AiPromptSection vm={vm} task="dictation" />}
							{!subpage && activeSection === 'general' && <GeneralSection vm={vm} />}

							{!subpage && activeSection === 'transcription' && (
								<TranscriptionSection vm={vm} onOpenAutoExport={() => openSubpage('auto-export')} />
							)}

							{!subpage && activeSection === 'models' && <ModelsSection vm={vm} />}

							{!subpage && activeSection === 'ai' && <AiSection vm={vm} onOpenPrompt={openPrompt} />}

							{!subpage && activeSection === 'tuning' && (
								<TuningSection
									vm={vm}
									onOpenWhisper={() => openSubpage('whisper-options')}
									onOpenAudio={() => openSubpage('audio-processing')}
								/>
							)}

							{!subpage && activeSection === 'recording' && <RecordingSection />}

							{!subpage && activeSection === 'dictation' && <DictationSection vm={vm} onOpenCleanup={() => openSubpage('ai-dictation')} />}

							{activeSection === 'phone' && (
								<PhoneSection
									pairingOpen={subpage === 'phone-pairing'}
									onPairingChange={(open) => navigateInside(open ? 'phone-pairing' : null)}
								/>
							)}

							{!subpage && activeSection === 'api' && <ApiSection vm={vm} />}

							{!subpage && activeSection === 'privacy' && <PrivacySection vm={vm} />}

							{!subpage && activeSection === 'advanced' && <AdvancedSection vm={vm} />}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
