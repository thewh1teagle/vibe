import type { LucideIcon } from 'lucide-react'
import { Bot, Cpu, FileAudio, FileDown, Languages, Link2, Mic, Radio, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import FeatureCard from '~/components/FeatureCard'
import features from '~/lib/features.json'
import { m } from '~/paraglide/messages.js'

/*
 * Icon + copy for every feature slug in `features.json`. The message functions
 * are held by reference and called during render, so switching locale without a
 * reload swaps the text too.
 */
const content: Record<string, { icon: LucideIcon; title: () => string; description: () => string }> = {
	languages: { icon: Languages, title: m['feature-languages-title'], description: m['feature-languages-description'] },
	formats: { icon: FileDown, title: m['feature-formats-title'], description: m['feature-formats-description'] },
	url: { icon: Link2, title: m['feature-url-title'], description: m['feature-url-description'] },
	realtime: { icon: Radio, title: m['feature-realtime-title'], description: m['feature-realtime-description'] },
	summarize: { icon: Sparkles, title: m['feature-summarize-title'], description: m['feature-summarize-description'] },
	ollama: { icon: Bot, title: m['feature-ollama-title'], description: m['feature-ollama-description'] },
	'audio-video': { icon: FileAudio, title: m['feature-audio-video-title'], description: m['feature-audio-video-description'] },
	devices: { icon: Mic, title: m['feature-devices-title'], description: m['feature-devices-description'] },
	gpu: { icon: Cpu, title: m['feature-gpu-title'], description: m['feature-gpu-description'] },
	privacy: { icon: ShieldCheck, title: m['feature-privacy-title'], description: m['feature-privacy-description'] },
	customize: { icon: Settings2, title: m['feature-customize-title'], description: m['feature-customize-description'] },
}

export default function Features() {
	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24 pt-14 lg:pt-20">
			<header className="max-w-[52ch]">
				<p className="eyebrow">{m['features-eyebrow']()}</p>
				<h1 className="mt-5 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground lg:text-[3rem]">{m.features()}</h1>
				<p className="mt-5 text-[17px] leading-8 text-muted-foreground">{m.description()}</p>
			</header>

			<div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6">
				{features.map((feature) => {
					const entry = content[feature.slug]
					if (!entry) {
						return null
					}
					return (
						<FeatureCard key={feature.slug} title={entry.title()} description={entry.description()} imageURL={feature.imageURL} icon={entry.icon} />
					)
				})}
			</div>
		</main>
	)
}
