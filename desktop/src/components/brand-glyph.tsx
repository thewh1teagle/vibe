import { AudioLines, Boxes } from 'lucide-react'
import { siNvidia } from 'simple-icons'
import { cn } from '~/lib/style'

/** OpenAI has no simple-icons entry (trademark policy), so its mark ships with us. */
export const OPENAI_PATH =
	'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4066-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.0379-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

/** A vendor mark drawn from a 24×24 path, sized like the lucide icons beside it. */
export function BrandGlyph({ path, title, className }: { path: string; title: string; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" role="img" aria-label={title} className={cn('h-3.5 w-3.5 shrink-0', className)}>
			<path d={path} fill="currentColor" />
		</svg>
	)
}

/**
 * Who made the model, read off its filename. Whisper builds come from OpenAI, Parakeet/Canary/
 * Nemotron from NVIDIA's NeMo; Silero's VAD has no mark of its own, so it gets a waveform.
 */
export function ModelGlyph({ name, className }: { name: string; className?: string }) {
	const file = name.toLowerCase()

	if (/whisper|ggml-(tiny|base|small|medium|large)|large-v\d|distil/.test(file)) {
		return <BrandGlyph path={OPENAI_PATH} title="OpenAI Whisper" className={className} />
	}
	if (/parakeet|nemotron|canary|nvidia|nemo/.test(file)) {
		return <BrandGlyph path={siNvidia.path} title={siNvidia.title} className={className} />
	}
	if (/silero|vad/.test(file)) {
		return <AudioLines className={cn('h-3.5 w-3.5 shrink-0', className)} strokeWidth={1.75} />
	}
	// Anything the user brought themselves.
	return <Boxes className={cn('h-3.5 w-3.5 shrink-0', className)} strokeWidth={1.75} />
}
