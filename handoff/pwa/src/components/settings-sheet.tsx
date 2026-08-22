import type { ReactNode } from 'react'
import { Link2Off, X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { LanguagePicker } from '~/components/language-picker'
import { truncateId, type Capabilities } from '~/lib/handoff'

/**
 * The desktop app's settings grouping, ported verbatim from
 * `desktop/src/pages/settings/sections/shared.tsx` so the two read the same:
 * a 13px heading over one bordered container of hairline-divided rows.
 */
function SettingsGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
	return (
		<section className="space-y-2">
			{title && <h3 className="px-1 text-[13px] font-medium text-foreground">{title}</h3>}
			<div className="divide-y divide-border/45 overflow-hidden rounded-xl border border-border/60 bg-card">{children}</div>
		</section>
	)
}

function SettingsRow({ label, children }: { label: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2.5">
			<div className="shrink-0 text-sm text-foreground">{label}</div>
			{children && <div className="flex min-w-0 items-center justify-end gap-1.5 text-end">{children}</div>}
		</div>
	)
}

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

				{/*
					Grouped rows, matching the desktop app's settings: one bordered
					container per group, hairline-divided rows inside it, a 13px
					group heading above. Rows keep a 52px minimum so they stay a
					comfortable touch target.
				*/}
				<div className="mb-6 space-y-6">
					<SettingsGroup title="Desktop">
						<SettingsRow label="Paired with">
							<code className="font-mono text-xs text-muted-foreground">{truncateId(endpointId)}</code>
						</SettingsRow>
						{capabilities?.modelName && (
							<SettingsRow label="Model">
								<code className="font-mono text-xs break-all text-muted-foreground">
									{capabilities.modelName}
								</code>
							</SettingsRow>
						)}
					</SettingsGroup>

					<SettingsGroup title="Language">
						{!hasLanguages ? (
							<p className="px-4 py-2.5 text-xs text-muted-foreground">
								The desktop has not reported any languages yet. Load a model in Vibe, then re-check.
							</p>
						) : (
							<div className="space-y-2 px-4 py-3">
								<LanguagePicker capabilities={capabilities} value={lang} onChange={onLangChange} />
								<p className="text-xs text-muted-foreground">
									{canAuto
										? 'Auto-detect lets the model work out the spoken language.'
										: 'This model cannot detect the language, so pick one explicitly.'}
								</p>
							</div>
						)}
					</SettingsGroup>
				</div>

				<Button variant="destructive" className="h-12 w-full" onClick={onUnpair}>
					<Link2Off />
					Unpair this phone
				</Button>
			</div>
		</div>
	)
}
