import { cn } from '~/lib/utils'

interface FeatureCardProps {
	title: string
	description: string
	videoURL?: string
	imageURL?: string
	align?: string
}

const alignMap: Record<string, string> = {
	start: 'justify-start',
	center: 'justify-center',
	end: 'justify-end',
}

export default function FeatureCard({ title, description, videoURL, imageURL, align = 'start' }: FeatureCardProps) {
	return (
		<div>
			<div className="text-2xl font-medium">{title}</div>
			<div className="mb-6 mt-6 text-lg opacity-80">{description}</div>

			{imageURL && (
				<div className={cn('flex', alignMap[align] || 'justify-start')}>
					<img src={`/vibe${imageURL}`} alt="Image" className="rounded-lg transition-transform duration-500 ease-in-out hover:z-10 hover:scale-105" />
				</div>
			)}

			{videoURL && (
				<div className={cn('flex items-center', alignMap[align] || 'justify-start')}>
					<video src={`/vibe${videoURL}`} controls className="rounded-lg" />
				</div>
			)}
		</div>
	)
}
