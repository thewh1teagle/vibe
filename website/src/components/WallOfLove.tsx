import { useEffect, useMemo, useState } from 'react'
import { m } from '../paraglide/messages.js'
import Heart from '~/icons/Heart'

interface Supporter {
	id: string
	name: string
	message: string | null
	time_ago: string
}

/** Softens the top and bottom of a marquee viewport without painting over the page background. */
const FADE_MASK =
	'[mask-image:linear-gradient(to_bottom,transparent_0%,black_9%,black_91%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_9%,black_91%,transparent_100%)]'

function SupporterCard({ supporter }: { supporter: Supporter }) {
	return (
		<figure className="rounded-2xl border border-border bg-card p-5">
			<blockquote className="line-clamp-4 text-[14px] leading-6 break-words text-foreground/90">{supporter.message}</blockquote>
			<figcaption className="mt-4 flex items-center gap-2">
				<Heart className="size-3 shrink-0 text-primary/60" />
				<span className="truncate text-[13px] font-medium text-foreground">{supporter.name}</span>
				<span className="ms-auto shrink-0 text-[12px] text-muted-foreground">{supporter.time_ago}</span>
			</figcaption>
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
			<div className="mb-10 flex flex-col items-center gap-4">
				<span className="flex size-9 items-center justify-center rounded-full text-primary ring-1 ring-border">
					<Heart className="size-4" />
				</span>
				<h2 className="text-center text-[1.5rem] font-semibold tracking-[-0.02em] text-foreground lg:text-[1.875rem]">{m['loved-by-thousands']()}</h2>
			</div>
			{/* Mobile: single column vertical marquee */}
			<div dir="ltr" className={`group relative h-[450px] overflow-hidden md:hidden ${FADE_MASK} [&:hover_.animate-marquee-up]:pause`}>
				<MarqueeColumn supporters={supporters} duration={120} />
			</div>
			{/* Desktop: 3 columns */}
			<div dir="ltr" className={`relative hidden overflow-hidden md:block ${FADE_MASK}`}>
				<div className="group grid h-[600px] grid-cols-3 gap-4 [&:hover_.animate-marquee-up]:pause">
					{columns.map((col, i) => (
						<MarqueeColumn key={i} supporters={col} duration={durations[i]} />
					))}
				</div>
			</div>
		</section>
	)
}
