import { Link2Off, X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { LanguagePicker } from '~/components/language-picker'
import { truncateId, type Capabilities } from '~/lib/handoff'

interface Props {
	open: boolean
	endpointId: string
	capabilities: Capabilities | null
	lang: string
	onLangChange: (lang: string) => void
	onUnpair: () => void
	onClose: () => void
}

export function SettingsSheet({
	open,
	endpointId,
	capabilities,
	lang,
	onLangChange,
	onUnpair,
	onClose,
}: Props) {
	if (!open) return null

	// Every option below comes from the desktop's capabilities reply.
	const canAuto = capabilities?.languageDetection ?? false
	const hasLanguages = (capabilities?.languages.length ?? 0) > 0

	return (
		<div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
			<div
				className="animate-in-smooth safe-bottom max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-card px-5 pt-5"
				onClick={(e) => e.stopPropagation()}>
				<div className="mb-5 flex items-center justify-between">
					<h2 className="text-lg font-semibold">Settings</h2>
					<Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
						<X />
					</Button>
				</div>

				<div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/60 px-4 py-3">
					<span className="text-sm text-muted-foreground">Paired with</span>
					<code className="font-mono text-xs">{truncateId(endpointId)}</code>
				</div>

				{capabilities?.modelName && (
					<div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/60 px-4 py-3">
						<span className="text-sm text-muted-foreground">Model</span>
						<code className="font-mono text-xs break-all text-right">{capabilities.modelName}</code>
					</div>
				)}

				<div className="mb-6">
					<span className="eyebrow mb-2 block">Language</span>
					{!hasLanguages ? (
						<p className="text-sm text-muted-foreground">
							The desktop has not reported any languages yet. Load a model in Vibe, then re-check.
						</p>
					) : (
						<>
							<LanguagePicker capabilities={capabilities} value={lang} onChange={onLangChange} />
							<p className="mt-2 text-xs text-muted-foreground">
								{canAuto
									? 'Auto-detect lets the model work out the spoken language.'
									: 'This model cannot detect the language, so pick one explicitly.'}
							</p>
						</>
					)}
				</div>

				<Button variant="destructive" className="h-12 w-full" onClick={onUnpair}>
					<Link2Off />
					Unpair this phone
				</Button>
			</div>
		</div>
	)
}
