import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Supporter {
	id: string
	name: string
	message: string | null
	time_ago: string
}

const AVATAR_COLORS = [
	'bg-rose-500',
	'bg-pink-500',
	'bg-fuchsia-500',
	'bg-purple-500',
	'bg-violet-500',
	'bg-indigo-500',
	'bg-blue-500',
	'bg-sky-500',
	'bg-cyan-500',
	'bg-teal-500',
	'bg-emerald-500',
	'bg-green-500',
	'bg-lime-600',
	'bg-amber-500',
	'bg-orange-500',
	'bg-red-500',
]

function hashString(str: string): number {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash)
	}
	return Math.abs(hash)
}

function getInitial(name: string): string {
	return name.charAt(0).toUpperCase()
}

function SupporterCard({ supporter }: { supporter: Supporter }) {
	const colorClass = AVATAR_COLORS[hashString(supporter.id) % AVATAR_COLORS.length]

	return (
		<div className="flex gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
			<div className={`${colorClass} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white`}>
				{getInitial(supporter.name)}
			</div>
			<div className="min-w-0">
				<div className="flex items-baseline gap-2">
					<p className="font-semibold">{supporter.name}</p>
					<span className="shrink-0 text-xs text-muted-foreground/60">{supporter.time_ago}</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{supporter.message}</p>
			</div>
		</div>
	)
}


function MarqueeColumn({ supporters, duration, className }: { supporters: Supporter[]; duration: number; className?: string }) {
	return (
		<div className={`relative h-full overflow-hidden ${className ?? ''}`}>
			<div
				className="animate-marquee-up flex flex-col gap-4"
				style={{ animationDuration: `${duration}s` }}
			>
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
	const { t } = useTranslation()
	const [supporters, setSupporters] = useState<Supporter[]>([])

	useEffect(() => {
		fetch('/vibe/kofi-supporters.json')
			.then((res) => res.json())
			.then((data: Supporter[]) => {
				const withMessages = data.filter((s) => s.message)
				setSupporters(withMessages)
			})
			.catch(() => {})
	}, [])

	const columns = useMemo(() => {
		if (supporters.length === 0) return []
		const third = Math.ceil(supporters.length / 3)
		return [
			supporters.slice(0, third),
			supporters.slice(third, third * 2),
			supporters.slice(third * 2),
		]
	}, [supporters])


	if (supporters.length === 0) return null

	const durations = [60, 80, 50]

	return (
		<section className="m-auto mt-20 w-[95%] lg:w-[1000px]">
			<h2 className="mb-8 text-center text-2xl font-bold lg:text-3xl">{t('loved-by-thousands')}</h2>
			{/* Mobile: single column vertical marquee */}
			<div dir="ltr" className="relative h-[450px] overflow-hidden md:hidden">
				<MarqueeColumn supporters={supporters} duration={120} />
				<div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-background to-transparent" />
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent" />
			</div>
			{/* Desktop: 3 columns */}
			<div
				dir="ltr"
				className="relative hidden overflow-hidden md:block"
				style={{ maxHeight: '600px' }}
			>
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
