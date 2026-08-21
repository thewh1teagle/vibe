import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { m } from '../paraglide/messages.js'
import Heart from '~/icons/Heart'

interface Supporter {
	id: string
	name: string
	message: string | null
	time_ago: string
}

/** Eight muted pastels walked around the aurora hues — see `--wol-*` in globals.css. */
const TINT_COUNT = 8

function getInitial(name: string): string {
	return name.charAt(0).toUpperCase()
}

/** Deterministic per-name tint so a supporter always keeps the same colour. */
function getTint(name: string): string {
	let hash = 0
	for (let i = 0; i < name.length; i += 1) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0
	}
	return `var(--wol-${(hash % TINT_COUNT) + 1})`
}

function SupporterCard({ supporter }: { supporter: Supporter }) {
	const style = { '--wol-tint': getTint(supporter.name) } as CSSProperties

	return (
		<figure style={style} className="wol-card flex gap-3.5 rounded-2xl border p-5 transition-shadow duration-200 hover:shadow-md">
			<div className="wol-avatar flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
				{getInitial(supporter.name)}
			</div>
			<div className="min-w-0 flex-1">
				<figcaption className="flex items-baseline gap-2">
					<span className="truncate text-[13px] font-semibold text-foreground">{supporter.name}</span>
					<Heart className="wol-badge size-3 shrink-0 self-center" />
					<span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{supporter.time_ago}</span>
				</figcaption>
				<blockquote className="mt-1.5 text-[13px] leading-6 break-words text-muted-foreground">{supporter.message}</blockquote>
			</div>
		</figure>
	)
}

function MarqueeColumn({ supporters, duration, className }: { supporters: Supporter[]; duration: number; className?: string }) {
	return (
		<div className={`relative h-full overflow-hidden ${className ?? ''}`}>
			<div
				className="animate-marquee-up flex flex-col gap-4 [contain:layout_paint] [will-change:transform] motion-reduce:!transform-none motion-reduce:!animate-none"
				style={{ animationDuration: `${duration}s` }}>
				{supporters.map((s) => (
					<SupporterCard key={s.id} supporter={s} />
				))}
				{supporters.map((s) => (
					<SupporterCard key={`dup-${s.id}`} supporter={s} />
				))}
			</div>
		</div>
	)
}

export default function WallOfLove() {
	const [supporters, setSupporters] = useState<Supporter[]>([])

	useEffect(() => {
		const controller = new AbortController()
		fetch('/vibe/kofi-supporters.json', { signal: controller.signal })
			.then((res) => res.json())
			.then((data: Supporter[]) => {
				const withMessages = data.filter((s) => s.message).slice(0, 36)
				setSupporters(withMessages)
			})
			.catch((error: unknown) => {
				if ((error as Error).name !== 'AbortError') return
			})
		return () => controller.abort()
	}, [])

	const columns = useMemo(() => {
		if (supporters.length === 0) return []
		const third = Math.ceil(supporters.length / 3)
		return [supporters.slice(0, third), supporters.slice(third, third * 2), supporters.slice(third * 2)]
	}, [supporters])

	if (supporters.length === 0) return null

	const durations = [60, 80, 50]

	return (
		<section className="mt-20 w-full [contain-intrinsic-size:0_700px] [content-visibility:auto] lg:mt-28">
			<div className="mb-10 flex flex-col items-center gap-3">
				<span className="flex size-9 items-center justify-center rounded-full text-[color:var(--aurora-2)] ring-1 ring-border">
					<Heart className="size-4" />
				</span>
				<h2 className="text-center text-[1.5rem] font-semibold tracking-[-0.02em] text-foreground lg:text-[1.875rem]">{m['loved-by-thousands']()}</h2>
				<span aria-hidden className="aurora-bar h-[3px] w-24 rounded-full" />
			</div>
			{/* Mobile: single column vertical marquee */}
			<div dir="ltr" className="relative h-[450px] overflow-hidden md:hidden">
				<MarqueeColumn supporters={supporters} duration={120} />
				<div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-background to-transparent" />
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent" />
			</div>
			{/* Desktop: 3 columns */}
			<div dir="ltr" className="relative hidden overflow-hidden md:block" style={{ maxHeight: '600px' }}>
				<div className="group grid h-[600px] grid-cols-3 gap-4 [&:hover_.animate-marquee-up]:pause">
					{columns.map((col, i) => (
						<MarqueeColumn key={i} supporters={col} duration={durations[i]} />
					))}
				</div>
				<div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
				<div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
				<div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
			</div>
		</section>
	)
}
