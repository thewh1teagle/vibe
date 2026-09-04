import { ReactNode, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { ArrowLeft, Bot, Cpu, Globe, Mic, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Terminal, Wrench, X } from 'lucide-react'
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
import { SummarizeSection } from './sections/summarize'
import { TranscriptionSection } from './sections/transcription'
import { TuningSection } from './sections/tuning'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

type SectionId = 'general' | 'transcription' | 'models' | 'summarize' | 'tuning' | 'recording' | 'dictation' | 'phone' | 'api' | 'privacy' | 'advanced'

interface SettingsSection {
	id: SectionId
	label: string
	icon: ReactNode
}

interface SettingsGroup {
	label: string
	sections: SettingsSection[]
}

export default function SettingsPage({ setVisible, scrollTo }: SettingsPageProps) {
	const vm = viewModel()

	const groups: SettingsGroup[] = [
		{
			label: m.general(),
			sections: [
				{ id: 'general', label: m.general(), icon: <Globe className="h-4 w-4" /> },
				{ id: 'privacy', label: m.privacy(), icon: <ShieldCheck className="h-4 w-4" /> },
			],
		},
		{
			label: m.transcription(),
			sections: [
				{ id: 'transcription', label: m.transcription(), icon: <SlidersHorizontal className="h-4 w-4" /> },
				{ id: 'models', label: m.selectModel(), icon: <Bot className="h-4 w-4" /> },
				{ id: 'tuning', label: m.fineTuning(), icon: <Cpu className="h-4 w-4" /> },
			],
		},
		{
			label: m.customize(),
			sections: [
				{ id: 'recording', label: m.recordingSettings(), icon: <Mic className="h-4 w-4" /> },
				{ id: 'dictation', label: m.globalDictation(), icon: <Mic className="h-4 w-4" /> },
				{ id: 'summarize', label: m.processWithLlm(), icon: <Sparkles className="h-4 w-4" /> },
				{ id: 'phone', label: m.phone(), icon: <Smartphone className="h-4 w-4" /> },
			],
		},
		{
			label: m.advanced(),
			sections: [
				{ id: 'api', label: m.apiAndAgents(), icon: <Terminal className="h-4 w-4" /> },
				{ id: 'advanced', label: m.advanced(), icon: <Wrench className="h-4 w-4" /> },
			],
		},
	]
	const sections = groups.flatMap((group) => group.sections)

	const [activeSection, setActiveSection] = useState<SectionId>(
		scrollTo === 'auto-export' ? 'transcription' : sections.some((s) => s.id === scrollTo) ? (scrollTo as SectionId) : 'general',
	)
	// A page under a section, with its own title and a way back; no dialog over the modal.
	const [subpage, setSubpage] = useState<'auto-export' | null>(scrollTo === 'auto-export' ? 'auto-export' : null)
	function goTo(section: SectionId) {
		setSubpage(null)
		setActiveSection(section)
	}

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
					<nav aria-label={m.settings()} className="flex flex-1 flex-col gap-3 overflow-y-auto">
						{groups.map((group) => (
							<div key={group.label} className="space-y-0.5">
								<p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{group.label}</p>
								{group.sections.map((section) => (
									<button
										key={section.id}
										type="button"
										aria-current={activeSection === section.id ? 'page' : undefined}
										onClick={() => goTo(section.id)}
										className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors ${
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
					<p className="mt-2 border-t border-border/55 px-2.5 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
						{vm.appVersion}
					</p>
				</div>

				<div className="min-w-0 flex-1 overflow-y-auto p-6">
					<div className="mb-5 flex items-center gap-2 border-b border-border/55 pb-3">
						{subpage && (
							<Button variant="ghost" size="iconSm" className="-ms-1 h-7 w-7 rounded-lg" onClick={() => setSubpage(null)} aria-label={m.back()}>
								<ArrowLeft className="h-4 w-4" />
							</Button>
						)}
						<h2 className="text-xl font-semibold">
							{subpage === 'auto-export' ? m.autoExport() : sections.find((s) => s.id === activeSection)?.label}
						</h2>
					</div>
					{subpage === 'auto-export' && <AutoExportSection vm={vm} />}
					{!subpage && activeSection === 'general' && <GeneralSection vm={vm} />}

					{!subpage && activeSection === 'transcription' && <TranscriptionSection vm={vm} onOpenAutoExport={() => setSubpage('auto-export')} />}

					{!subpage && activeSection === 'models' && <ModelsSection vm={vm} />}

					{!subpage && activeSection === 'summarize' && <SummarizeSection vm={vm} />}

					{!subpage && activeSection === 'tuning' && <TuningSection vm={vm} />}

					{!subpage && activeSection === 'recording' && <RecordingSection />}

					{!subpage && activeSection === 'dictation' && <DictationSection />}

					{!subpage && activeSection === 'phone' && <PhoneSection vm={vm} />}

					{!subpage && activeSection === 'api' && <ApiSection vm={vm} />}

					{!subpage && activeSection === 'privacy' && <PrivacySection vm={vm} />}

					{!subpage && activeSection === 'advanced' && <AdvancedSection vm={vm} />}
				</div>
			</div>
		</div>
	)
}
