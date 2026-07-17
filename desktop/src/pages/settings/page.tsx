import { ReactNode, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import {
	Bot,
	Cpu,
	Globe,
	Mic,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Terminal,
	Wrench,
	X,
} from 'lucide-react'
import { ModifyState } from '~/lib/types'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import { AdvancedSection } from './sections/advanced'
import { ApiSection } from './sections/api'
import { DictationSection } from './sections/dictation'
import { GeneralSection } from './sections/general'
import { ModelsSection } from './sections/models'
import { PrivacySection } from './sections/privacy'
import { SummarizeSection } from './sections/summarize'
import { TranscriptionSection } from './sections/transcription'
import { TuningSection } from './sections/tuning'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

type SectionId = 'general' | 'transcription' | 'models' | 'summarize' | 'tuning' | 'dictation' | 'api' | 'privacy' | 'advanced'

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
				{ id: 'dictation', label: m.globalDictation(), icon: <Mic className="h-4 w-4" /> },
				{ id: 'summarize', label: m.processWithLlm(), icon: <Sparkles className="h-4 w-4" /> },
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
		sections.some((s) => s.id === scrollTo) ? (scrollTo as SectionId) : 'general',
	)

	return (
		<div className="flex h-screen items-center justify-center p-6 sm:p-8">
			<div
				onMouseDown={(event) => event.stopPropagation()}
				className="flex h-[640px] max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
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
								<p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
									{group.label}
								</p>
								{group.sections.map((section) => (
									<button
										key={section.id}
										type="button"
										aria-current={activeSection === section.id ? 'page' : undefined}
										onClick={() => setActiveSection(section.id)}
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
					<div className="mb-5 border-b border-border/55 pb-3">
						<h2 className="text-xl font-semibold">{sections.find((s) => s.id === activeSection)?.label}</h2>
					</div>
					{activeSection === 'general' && <GeneralSection vm={vm} />}

					{activeSection === 'transcription' && <TranscriptionSection vm={vm} />}

					{activeSection === 'models' && <ModelsSection vm={vm} />}

					{activeSection === 'summarize' && <SummarizeSection vm={vm} />}

					{activeSection === 'tuning' && <TuningSection vm={vm} />}

					{activeSection === 'dictation' && <DictationSection />}

					{activeSection === 'api' && <ApiSection vm={vm} />}

					{activeSection === 'privacy' && <PrivacySection vm={vm} />}

					{activeSection === 'advanced' && <AdvancedSection vm={vm} />}

				</div>
			</div>
		</div>
	)
}
