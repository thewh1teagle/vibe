import type { LucideIcon } from 'lucide-react'
import { Bot, Cpu, FileAudio, FileDown, Languages, Link2, Mic, Radio, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import FeatureCard from '~/components/FeatureCard'
import features from '~/lib/features.json'
import { m } from '~/paraglide/messages.js'

const icons: Record<string, LucideIcon> = {
	'Transcribe almost every language': Languages,
	'Multiple formats': FileDown,
	'Transcribe from popular websites': Link2,
	'Real-time Transcription Preview': Radio,
	'Summarize With AI': Sparkles,
	'Ollama Integration': Bot,
	'Transcribe audio / video': FileAudio,
	'Transcribe microphone / speakers': Mic,
	'Optimized for GPU': Cpu,
	'Ultimate privacy': ShieldCheck,
	'Total Freedom': Settings2,
}

export default function Features() {
	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20" dir="ltr">
			<header className="max-w-[46ch]">
				<p className="eyebrow">Everything Vibe does</p>
				<h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground lg:text-[2.75rem]">{m.features()}</h1>
				<p className="mt-4 text-base leading-7 text-muted-foreground">{m.description()}</p>
			</header>

			<div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{features.map((feature) => (
					<FeatureCard key={feature.title} {...feature} icon={icons[feature.title]} />
				))}
			</div>
		</main>
	)
}
