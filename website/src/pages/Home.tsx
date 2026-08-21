import { useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FolderOpen, Globe, Languages, Layers, Link2, Mic, Plus, Settings, ShieldCheck, SlidersHorizontal, Upload } from 'lucide-react'
import { m } from '../paraglide/messages.js'
import Cta from '~/components/Cta'
import WallOfLove from '~/components/WallOfLove'
import { Button } from '~/components/ui/button'

interface LayoutContext {
	onOpenKofi: () => void
}

const highlights = [
	{
		id: 'private',
		icon: ShieldCheck,
		title: m['highlight-private-title'],
		description: m['highlight-private-description'],
	},
	{
		id: 'languages',
		icon: Languages,
		title: m['highlight-languages-title'],
		description: m['highlight-languages-description'],
	},
	{
		id: 'batch',
		icon: Layers,
		title: m['highlight-batch-title'],
		description: m['highlight-batch-description'],
	},
]

/*
 * Code-drawn mock of the desktop app's idle screen — no bitmap, so it stays
 * crisp at any density. It pins the app's light ChatGPT palette rather than the
 * site tokens: the window has to read as the app on either page theme. Kept
 * monochrome, like the real idle screen.
 */
const app = {
	surface: '#ffffff',
	sidebar: '#f9f9f9',
	muted: '#f4f4f4',
	line: '#e6e6e6',
	ink: '#1a1c1f',
	inkMuted: '#6e6e6e',
	inkFaint: '#dcdcdc',
}

/** One key of the joined, icon-only source switcher. The active key reads as raised. */
function MockSegment({ active, children }: { active?: boolean; children: React.ReactNode }) {
	return (
		<span
			className="inline-flex h-[1.75rem] w-[2.5rem] items-center justify-center rounded-full"
			style={active ? { background: app.surface, color: app.ink, boxShadow: '0 1px 2px rgb(0 0 0 / 0.08)' } : { color: app.inkMuted }}>
			{children}
		</span>
	)
}

function AppMock() {
	return (
		<div
			dir="ltr"
			aria-hidden="true"
			className="pointer-events-none relative z-10 flex w-full min-w-0 select-none overflow-hidden rounded-2xl border shadow-xl sm:aspect-[16/10]"
			style={{ background: app.surface, borderColor: app.line, color: app.ink }}>
			{/* Recents sidebar */}
			<div className="hidden w-[11rem] shrink-0 flex-col border-e sm:flex" style={{ background: app.sidebar, borderColor: app.line }}>
				{/* Titlebar strip: traffic lights sit beside the wordmark, ChatGPT style. */}
				<div className="flex h-[2rem] items-center gap-[0.3125rem] px-3">
					<span className="size-[0.5rem] rounded-full" style={{ background: '#e0796d' }} />
					<span className="size-[0.5rem] rounded-full" style={{ background: '#dcb264' }} />
					<span className="size-[0.5rem] rounded-full" style={{ background: '#7cbc8b' }} />
				</div>
				<div className="px-3 pb-2">
					<span className="text-[0.8125rem] font-semibold tracking-[-0.03em]">Vibe</span>
				</div>

				<div className="px-2">
					<span className="flex items-center gap-2 rounded-[0.625rem] px-2.5 py-1.5 text-[0.6875rem] font-medium">
						<Plus className="size-[0.75rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						New transcription
					</span>
				</div>

				<p className="px-3 pt-3 pb-1.5 text-[0.5625rem] font-medium tracking-[0.08em] uppercase" style={{ color: app.inkMuted }}>
					Recents
				</p>

				<div className="flex flex-col gap-2.5 px-4 pb-3">
					{[0.86, 0.62, 0.74].map((width, index) => (
						<span key={index} className="flex flex-col gap-1">
							<span className="h-[0.375rem] rounded-full" style={{ width: `${width * 100}%`, background: app.inkFaint }} />
							<span className="h-[0.25rem] rounded-full" style={{ width: `${width * 55}%`, background: app.muted }} />
						</span>
					))}
				</div>

				<div className="mt-auto border-t p-2" style={{ borderColor: app.line }}>
					<span className="flex items-center gap-2 rounded-[0.625rem] px-2.5 py-1.5 text-[0.6875rem] font-medium">
						<Settings className="size-[0.75rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						Settings
					</span>
				</div>
			</div>

			{/* Main pane — the idle screen: switcher, drop zone, quiet row. */}
			<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-7 sm:px-12 sm:py-10">
				{/* Joined, icon-only source switcher */}
				<div className="inline-flex items-center gap-1 rounded-full border p-[0.1875rem]" style={{ borderColor: app.line, background: app.muted }}>
					<MockSegment active>
						<FolderOpen className="size-[0.8125rem]" strokeWidth={1.75} />
					</MockSegment>
					<MockSegment>
						<Mic className="size-[0.8125rem]" strokeWidth={1.75} />
					</MockSegment>
					<MockSegment>
						<Link2 className="size-[0.8125rem]" strokeWidth={1.75} />
					</MockSegment>
				</div>

				{/* Quiet drop zone */}
				<div
					className="flex w-full flex-col items-center gap-2.5 rounded-[1.125rem] border-2 border-dashed px-6 py-8 text-center sm:py-11"
					style={{ borderColor: app.line, background: app.muted }}>
					<span
						className="flex size-[2rem] items-center justify-center rounded-full"
						style={{ background: app.surface, boxShadow: '0 1px 2px rgb(0 0 0 / 0.06)' }}>
						<Upload className="size-[0.875rem]" strokeWidth={1.75} />
					</span>
					<span className="flex flex-col gap-0.5">
						<span className="text-[0.8125rem] font-semibold tracking-[-0.02em]">Drop audio, video or a folder here</span>
						<span className="text-[0.625rem]" style={{ color: app.inkMuted }}>
							or click to browse your files
						</span>
					</span>
				</div>

				{/* Quiet row: language pill, then the More Options ghost label */}
				<div className="flex w-full items-center gap-2">
					<span
						className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[0.25rem] text-[0.625rem] font-medium"
						style={{ borderColor: app.line, background: app.surface }}>
						<Globe className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						Auto Detect
					</span>
					<span
						className="inline-flex items-center gap-1.5 rounded-full px-2 py-[0.25rem] text-[0.625rem] font-medium"
						style={{ color: app.inkMuted }}>
						<SlidersHorizontal className="size-[0.6875rem]" strokeWidth={1.75} />
						More Options
					</span>
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
				<p className="eyebrow">{m['hero-eyebrow']()}</p>
				<h1 className="mt-5 text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-foreground sm:whitespace-nowrap sm:text-[clamp(2.25rem,4.5vw,3.5rem)]">
					{m.title()}
				</h1>
				<p className="mt-5 max-w-[52ch] text-base leading-7 text-muted-foreground">{m.description()}</p>

				<div ref={ctaRef} className="mt-9 flex scroll-mt-24 flex-col items-center">
					<Cta onOpenKofi={onOpenKofi} />
				</div>
			</section>

			{/* Aurora showcase */}
			<section className="mt-16 lg:mt-20">
				<div className="aurora mx-auto w-full max-w-[880px] overflow-hidden rounded-3xl border border-border p-2 sm:p-4 lg:p-6">
					<AppMock />
				</div>
			</section>

			{/* Highlights */}
			<section className="mt-16 border-t border-border pt-12 lg:mt-24">
				<div className="grid grid-cols-1 gap-8 divide-y divide-border sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
					{highlights.map((item) => (
						<div key={item.id} className="flex min-w-0 flex-col gap-3 pb-8 text-start last:pb-0 sm:ps-7 sm:pe-7 sm:pb-0 sm:first:ps-0 sm:last:pe-0">
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
								<item.icon className="size-4" strokeWidth={1.75} aria-hidden />
							</span>
							<h2 className="text-[15px] font-medium tracking-[-0.01em] text-balance text-foreground">{item.title()}</h2>
							<p className="text-[13px] leading-6 break-words hyphens-auto text-muted-foreground">{item.description()}</p>
						</div>
					))}
				</div>
			</section>

			<WallOfLove />

			{/* Closing band */}
			<section className="mt-20 lg:mt-28">
				<div className="site-cta overflow-hidden rounded-3xl border border-border">
					<div className="flex flex-col items-center gap-7 px-6 py-20 text-center sm:px-12 lg:py-24">
						<h2 className="text-[1.5rem] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground sm:whitespace-nowrap sm:text-[clamp(1.625rem,3vw,2.25rem)]">
							{m['closing-band-title']()}
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
