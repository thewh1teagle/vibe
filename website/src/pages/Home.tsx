import { useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Languages, Layers, ShieldCheck, UploadCloud } from 'lucide-react'
import { m } from '../paraglide/messages.js'
import Cta from '~/components/Cta'
import WallOfLove from '~/components/WallOfLove'
import Logo from '~/icons/Logo'
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

/*
 * Code-drawn mock of the desktop app — no bitmap, so it stays crisp at any
 * density. It carries its own fixed "paper" palette rather than the site
 * tokens: the window has to read as the app in both light and dark mode.
 */
const paper = {
	surface: '#fbfbf9',
	chrome: '#f0f0ec',
	line: '#e4e4de',
	ink: '#1a1a18',
	inkMuted: '#8a8a82',
	inkFaint: '#c9c9c2',
}

function AppMock() {
	return (
		<div
			dir="ltr"
			aria-hidden="true"
			className="pointer-events-none relative z-10 w-full select-none overflow-hidden rounded-2xl border shadow-xl"
			style={{ background: paper.surface, borderColor: paper.line, color: paper.ink }}>
			{/* Title bar */}
			<div className="flex h-9 items-center gap-2 border-b px-3" style={{ background: paper.chrome, borderColor: paper.line }}>
				<span className="flex items-center gap-[0.3125rem]">
					<span className="size-[0.5rem] rounded-full" style={{ background: '#e0796d' }} />
					<span className="size-[0.5rem] rounded-full" style={{ background: '#dcb264' }} />
					<span className="size-[0.5rem] rounded-full" style={{ background: '#7cbc8b' }} />
				</span>
				<span className="ms-2 flex items-center gap-1.5">
					<Logo className="size-[0.875rem]" />
					<span className="text-[0.6875rem] font-semibold tracking-[-0.02em]">Vibe</span>
				</span>
			</div>

			<div className="flex">
				{/* Recents sidebar hint */}
				<div className="hidden w-[8.5rem] shrink-0 flex-col gap-2 border-e p-3 sm:flex" style={{ borderColor: paper.line }}>
					<span className="text-[0.5625rem] font-medium tracking-[0.08em] uppercase" style={{ color: paper.inkMuted }}>
						Recents
					</span>
					{[0.85, 0.6, 0.72, 0.45].map((width, index) => (
						<span key={index} className="flex items-center gap-1.5">
							<span className="size-[0.75rem] shrink-0 rounded-[0.25rem]" style={{ background: paper.chrome }} />
							<span className="h-[0.375rem] rounded-full" style={{ width: `${width * 100}%`, background: paper.inkFaint }} />
						</span>
					))}
				</div>

				{/* Main pane */}
				<div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
					{/* Source pills */}
					<div className="flex flex-wrap items-center gap-1.5">
						{['File', 'Folder', 'URL', 'Microphone'].map((source, index) => (
							<span
								key={source}
								className="rounded-full border px-2.5 py-[0.1875rem] text-[0.625rem] font-medium"
								style={
									index === 0
										? { background: paper.ink, borderColor: paper.ink, color: paper.surface }
										: { background: paper.surface, borderColor: paper.line, color: paper.inkMuted }
								}>
								{source}
							</span>
						))}
					</div>

					{/* Drop zone */}
					<div
						className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center sm:py-12"
						style={{ borderColor: paper.line, background: paper.chrome }}>
						<UploadCloud className="size-[1.5rem]" strokeWidth={1.5} style={{ color: paper.inkMuted }} />
						<span className="text-[0.75rem] font-medium">Drop audio, video or a folder here</span>
						<span className="text-[0.625rem]" style={{ color: paper.inkMuted }}>
							mp3 · wav · m4a · mp4 · mkv · webm
						</span>
					</div>

					{/* Quiet language / model row */}
					<div className="flex flex-wrap items-center gap-1.5">
						{['English', 'Auto detect', 'large-v3-turbo', 'GPU'].map((label) => (
							<span
								key={label}
								className="rounded-full px-2 py-[0.125rem] text-[0.5625rem]"
								style={{ background: paper.chrome, color: paper.inkMuted }}>
								{label}
							</span>
						))}
						<span className="ms-auto text-[0.5625rem]" style={{ color: paper.inkFaint }}>
							Ready
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}

export default function Home() {
	const { onOpenKofi } = useOutletContext<LayoutContext>()
	const ctaRef = useRef<HTMLDivElement>(null)

	const scrollToCta = useCallback(() => {
		ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}, [])

	return (
		<div className="mx-auto w-full max-w-[1065px] overflow-x-hidden px-5 pb-24">
			{/* Hero */}
			<section className="flex flex-col items-center pt-14 text-center lg:pt-24">
				<p className="eyebrow">On-device transcription</p>
				<h1 className="mt-5 max-w-[16ch] text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.03em] text-foreground lg:text-[3.5rem]">
					{m.title()}
				</h1>
				<p className="mt-5 max-w-[52ch] text-base leading-7 text-muted-foreground">{m.description()}</p>

				<div ref={ctaRef} className="mt-9 flex scroll-mt-24 flex-col items-center">
					<Cta onOpenKofi={onOpenKofi} />
				</div>
			</section>

			{/* Aurora showcase */}
			<section className="mt-16 lg:mt-20">
				<div className="aurora w-full overflow-hidden rounded-3xl border border-border p-2 sm:p-4 lg:p-8">
					<AppMock />
				</div>
			</section>

			{/* Highlights */}
			<section className="mt-16 border-t border-border pt-12 lg:mt-24">
				{/*
				 * Untranslated English copy — kept LTR so the sentences read and
				 * punctuate correctly on RTL pages. Paddings still use logical
				 * utilities so the block mirrors if these strings ever get keys.
				 */}
				<div dir="ltr" className="grid grid-cols-1 gap-8 divide-y divide-border sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
					{highlights.map((item) => (
						<div
							key={item.title}
							className="flex min-w-0 flex-col gap-3 pb-8 text-start last:pb-0 sm:ps-7 sm:pe-7 sm:pb-0 sm:first:ps-0 sm:last:pe-0">
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
								<item.icon className="size-4" strokeWidth={1.75} aria-hidden />
							</span>
							<h2 className="text-[15px] font-medium tracking-[-0.01em] text-balance text-foreground">{item.title}</h2>
							<p className="text-[13px] leading-6 break-words hyphens-auto text-muted-foreground">{item.description}</p>
						</div>
					))}
				</div>
			</section>

			<WallOfLove />

			{/* Closing band */}
			<section className="mt-20 lg:mt-28">
				<div className="aurora aurora-strong overflow-hidden rounded-3xl border border-border">
					<div className="relative z-10 flex flex-col items-center gap-6 px-6 py-16 text-center sm:px-12">
						<h2
							dir="ltr"
							className="max-w-[20ch] text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground drop-shadow-sm lg:text-[2.25rem]">
							Free, open source, and yours to run.
						</h2>
						<Button size="lg" onClick={scrollToCta}>
							{m.download()}
						</Button>
					</div>
				</div>
			</section>
		</div>
	)
}
