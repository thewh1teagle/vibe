import type { LucideIcon } from 'lucide-react'
import { Sparkles } from 'lucide-react'
import { m } from '~/paraglide/messages.js'

interface FeatureCardProps {
	title: string
	description: string
	videoURL?: string
	imageURL?: string
	icon?: LucideIcon
}

export default function FeatureCard({ title, description, videoURL, imageURL, icon: Icon = Sparkles }: FeatureCardProps) {
	return (
		<article className="group relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-[box-shadow,border-color] duration-300 hover:border-border hover:shadow-md sm:p-7">
			{/* A sheen along the top edge, so the card reads as lit rather than flat. */}
			<span
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/12 to-transparent dark:via-foreground/20"
			/>

			<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-inset ring-border/60 transition-colors duration-300 group-hover:bg-accent/60">
				<Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
			</span>

			<div className="flex flex-col gap-2.5 text-start">
				<h3 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-foreground">{title}</h3>
				<p className="text-[14.5px] leading-[1.65] text-muted-foreground">{description}</p>
			</div>

			{/* The media runs to the card edges — inset, it reads as a thumbnail rather than a screenshot. */}
			{(imageURL || videoURL) && (
				<div className="-mx-6 -mb-6 mt-auto border-t border-border/60 bg-muted sm:-mx-7 sm:-mb-7">
					{imageURL ? (
						<img src={`/vibe${imageURL}`} alt={m.image()} loading="lazy" className="block aspect-[16/9] w-full object-cover object-top" />
					) : (
						<video src={`/vibe${videoURL}`} controls className="block aspect-[16/9] w-full object-cover" />
					)}
				</div>
			)}
		</article>
	)
}
