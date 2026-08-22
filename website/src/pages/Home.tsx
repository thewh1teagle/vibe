import { useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Copy, Download, Languages, Layers, Pause, Plus, Search, Settings, ShieldCheck, SlidersHorizontal } from 'lucide-react'
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
	surface: 'var(--mock-surface)',
	sidebar: 'var(--mock-sidebar)',
	muted: 'var(--mock-muted)',
	line: 'var(--mock-line)',
	ink: 'var(--mock-ink)',
	inkMuted: 'var(--mock-ink-muted)',
	inkFaint: 'var(--mock-faint)',
	active: 'var(--mock-active)',
	accent: 'var(--mock-accent)',
	accentInk: 'var(--mock-accent-ink)',
}

/** One transcript line: the timestamp gutter plus the text. The spoken line carries a soft wash. */
function MockLine({ time, text, active }: { time: string; text: string; active?: boolean }) {
	return (
		<span className="relative flex gap-2.5 rounded-[0.625rem] px-2 py-1.5">
			{active && (
				<span
					className="pointer-events-none absolute inset-0 rounded-[0.625rem]"
					style={{ background: `linear-gradient(90deg, ${app.active} 0%, transparent 85%)` }}
				/>
			)}
			<span
				className="relative mt-[0.125rem] shrink-0 text-[0.5625rem] tabular-nums"
				style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: active ? app.accent : app.inkMuted }}>
				{time}
			</span>
			<span className="relative text-[0.6875rem] leading-[1.6]" style={{ color: app.ink }}>
				{text}
			</span>
		</span>
	)
}

/**
 * Code-drawn mock of the app's transcript screen — no bitmap, so it stays crisp at any density and
 * follows the page theme through the `--mock-*` tokens.
 */
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

				<div className="px-3 pt-1.5">
					<span
						className="flex items-center gap-1.5 rounded-full border px-2.5 py-[0.25rem] text-[0.5625rem]"
						style={{ borderColor: app.line, color: app.inkMuted }}>
						<Search className="size-[0.625rem]" strokeWidth={1.75} />
						Search recents
					</span>
				</div>

				<p className="px-3 pt-3 pb-1.5 text-[0.5625rem] font-medium tracking-[0.08em] uppercase" style={{ color: app.inkMuted }}>
					Recents
				</p>

				<div className="flex flex-col gap-1 px-2 pb-3">
					{[
						{ name: 'podcast-episode', time: 'just now', active: true },
						{ name: 'team-standup', time: '2h ago', active: false },
						{ name: 'interview', time: 'yesterday', active: false },
					].map((row) => (
						<span
							key={row.name}
							className="flex flex-col gap-[0.125rem] rounded-[0.625rem] px-2.5 py-1.5"
							style={row.active ? { background: app.active } : undefined}>
							<span className="text-[0.6875rem] font-medium" style={{ color: app.ink }}>
								{row.name}
							</span>
							<span className="text-[0.5625rem]" style={{ color: app.inkMuted }}>
								{row.time}
							</span>
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

			{/* Main pane — the transcript: toolbar, lines, player. */}
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex h-[2.25rem] shrink-0 items-center gap-3 border-b px-3" style={{ borderColor: app.line }}>
					<span className="flex items-center gap-1.5 text-[0.625rem] font-medium">
						<Copy className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						Copy
					</span>
					<span className="flex items-center gap-1.5 text-[0.625rem] font-medium">
						<Download className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						Save
					</span>
					<Search className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
					<SlidersHorizontal className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
					<span className="ms-auto flex items-center gap-1.5 text-[0.625rem] font-medium">
						<Plus className="size-[0.6875rem]" strokeWidth={1.75} style={{ color: app.inkMuted }} />
						New
					</span>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-4 sm:px-8 sm:py-6">
					<p className="pb-2 text-[0.5625rem] font-medium tracking-[0.08em] uppercase" style={{ color: app.inkMuted }}>
						podcast-episode
					</p>
					<MockLine time="00:00" text="Welcome back to the show — today we talk about local AI." />
					<MockLine time="00:12" text="Everything runs on your machine, so nothing leaves your laptop." active />
					<MockLine time="00:24" text="Drop in a whole folder and it works through the queue on its own." />
					<MockLine time="00:36" text="Transcripts, subtitles and summaries, all offline." />
					<MockLine time="00:48" text="Speaker labels come from the audio itself, no cloud round trip." />
					<MockLine time="01:02" text="Click any line to fix a word, or a timestamp to hear it again." />
					<MockLine time="01:15" text="Then export to SRT, VTT, PDF or plain text in one click." />
				</div>

				{/* Player bar */}
				<div className="flex h-[2.75rem] shrink-0 items-center gap-3 border-t px-3" style={{ borderColor: app.line }}>
					<span className="hidden min-w-0 flex-col sm:flex">
						<span className="truncate text-[0.625rem] font-medium">podcast-episode.mp3</span>
						<span className="truncate text-[0.5625rem]" style={{ color: app.inkMuted }}>
							Documents/Vibe
						</span>
					</span>
					<span className="flex size-[1.375rem] shrink-0 items-center justify-center rounded-full" style={{ background: app.accent }}>
						<Pause className="size-[0.625rem]" fill="currentColor" style={{ color: app.accentInk }} />
					</span>
					<span
						className="text-[0.5625rem] tabular-nums"
						style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: app.inkMuted }}>
						0:14
					</span>
					<span className="h-[0.1875rem] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: app.muted }}>
						<span className="block h-full w-[22%] rounded-full" style={{ background: app.ink }} />
					</span>
					<span
						className="text-[0.5625rem] tabular-nums"
						style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: app.inkMuted }}>
						2:38
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
