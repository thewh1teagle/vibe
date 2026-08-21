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
		<article className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
				<Icon className="size-4" strokeWidth={1.75} aria-hidden />
			</span>

			<div className="flex flex-col gap-2 text-start">
				<h3 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{title}</h3>
				<p className="text-[13px] leading-6 text-muted-foreground">{description}</p>
			</div>

			{(imageURL || videoURL) && (
				<div className="mt-auto overflow-hidden rounded-lg border border-border bg-muted">
					{imageURL ? (
						<img src={`/vibe${imageURL}`} alt={m.image()} loading="lazy" className="block aspect-[16/10] w-full object-cover object-top" />
					) : (
						<video src={`/vibe${videoURL}`} controls className="block aspect-[16/10] w-full object-cover" />
					)}
				</div>
			)}
		</article>
	)
}
