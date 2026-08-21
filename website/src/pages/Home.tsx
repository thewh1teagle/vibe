import { useCallback, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Languages, Layers, ShieldCheck } from 'lucide-react'
import { m } from '../paraglide/messages.js'
import Cta from '~/components/Cta'
import WallOfLove from '~/components/WallOfLove'
import { Button } from '~/components/ui/button'

interface LayoutContext {
	onOpenKofi: () => void
}

const highlights = [
	{
		icon: ShieldCheck,
		title: 'Private by default',
		description: 'Transcription runs on your own machine. Audio never leaves your device, online or offline.',
	},
	{
		icon: Languages,
		title: 'Every language, every model',
		description: 'Close to 100 languages and a full range of Whisper models, from tiny to large.',
	},
	{
		icon: Layers,
		title: 'Batch and automate',
		description: 'Queue whole folders, export SRT, VTT, TXT, HTML or JSON, and drive it from the API.',
	},
]

export default function Home() {
	const { onOpenKofi } = useOutletContext<LayoutContext>()
	const ctaRef = useRef<HTMLDivElement>(null)

	const scrollToCta = useCallback(() => {
		ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}, [])

	return (
		<main className="mx-auto w-full max-w-[1065px] px-5 pb-24">
			{/* Hero */}
			<section className="flex flex-col items-center pt-14 text-center lg:pt-24">
				<p className="eyebrow">On-device transcription</p>
				<h1 className="mt-5 max-w-[16ch] text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground lg:text-[3.5rem]">
					{m.title()}
				</h1>
				<p className="mt-5 max-w-[52ch] text-base leading-7 text-muted-foreground">{m.description()}</p>

				<div ref={ctaRef} className="mt-9 flex scroll-mt-24 flex-col items-center">
					<Cta onOpenKofi={onOpenKofi} />
					<Button variant="ghost" size="sm" className="mt-4 text-muted-foreground" asChild>
						<Link to="/features">{m.features()}</Link>
					</Button>
				</div>
			</section>

			{/* Aurora showcase */}
			<section className="mt-16 lg:mt-20">
				<div className="aurora w-full overflow-hidden rounded-3xl border border-border p-2 sm:p-4 lg:p-8">
					<img
						className="relative z-10 block h-auto w-full max-w-full rounded-2xl border border-border/60 object-cover"
						alt="preview"
						loading="lazy"
						src="/vibe/preview.png"
					/>
				</div>
			</section>

			{/* Highlights */}
			<section className="mt-16 border-t border-border pt-12 lg:mt-24">
				<div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
					{highlights.map((item) => (
						<div key={item.title} className="flex flex-col gap-3 py-6 sm:px-7 sm:py-0 sm:first:ps-0 sm:last:pe-0">
							<span className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
								<item.icon className="size-4" strokeWidth={1.75} aria-hidden />
							</span>
							<h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{item.title}</h2>
							<p className="text-[13px] leading-6 text-muted-foreground">{item.description}</p>
						</div>
					))}
				</div>
			</section>

			<WallOfLove />

			{/* Closing band */}
			<section className="mt-20 lg:mt-28">
				<div className="aurora overflow-hidden rounded-3xl border border-border">
					<div className="relative z-10 flex flex-col items-center gap-6 bg-background/70 px-6 py-14 text-center backdrop-blur-sm sm:px-12">
						<h2 className="max-w-[20ch] text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground lg:text-[2.25rem]">
							Free, open source, and yours to run.
						</h2>
						<Button onClick={scrollToCta}>{m.download()}</Button>
					</div>
				</div>
			</section>
		</main>
	)
}
