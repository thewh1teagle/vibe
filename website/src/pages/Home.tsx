import { m } from '../paraglide/messages.js'
import { useOutletContext } from 'react-router-dom'
import Cta from '~/components/Cta'
import WallOfLove from '~/components/WallOfLove'

interface LayoutContext {
	onOpenKofi: () => void
}

export default function Home() {
	const { onOpenKofi } = useOutletContext<LayoutContext>()

	return (
		<>
			<h1 className="text-center text-3xl capitalize lg:text-6xl">{m.title()}</h1>
			<p className="m-auto mt-5 max-w-[78%] text-center text-base leading-8 text-muted-foreground lg:max-w-[600px]">{m.description()}</p>
			<div className="mt-10 flex flex-col items-center">
				<Cta onOpenKofi={onOpenKofi} />
			</div>
			<div className="m-auto mt-16 h-auto w-[95%] lg:w-[1000px]">
				<img
					className="h-auto w-full rounded-2xl object-cover transition-transform duration-500 ease-in-out hover:-translate-y-1 hover:scale-[1.03]"
					alt="preview"
					src="/vibe/preview.png"
				/>
			</div>
			<WallOfLove />
		</>
	)
}
